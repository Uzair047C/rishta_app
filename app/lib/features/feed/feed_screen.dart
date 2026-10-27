import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api.dart';
import '../../core/models.dart';
import '../../core/providers.dart';
import '../../core/theme.dart';
import '../../core/widgets.dart';
import '../subscription/subscription_screen.dart';

/// Browsing feed. Ranked server-side by interest overlap; this screen renders
/// the order it is given and never re-sorts.
class FeedScreen extends ConsumerStatefulWidget {
  const FeedScreen({super.key});

  @override
  ConsumerState<FeedScreen> createState() => _FeedScreenState();
}

class _FeedScreenState extends ConsumerState<FeedScreen> {
  final _scrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (_scrollController.position.pixels >=
        _scrollController.position.maxScrollExtent - 300) {
      ref.read(feedProvider.notifier).loadMore();
    }
  }

  @override
  Widget build(BuildContext context) {
    final feed = ref.watch(feedProvider);
    final subscription = ref.watch(subscriptionProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Discover'),
        actions: [
          IconButton(
            icon: const Icon(Icons.tune),
            tooltip: 'Filters',
            onPressed: () => _showFilters(context, ref),
          ),
        ],
      ),
      body: Column(
        children: [
          if (subscription.valueOrNull != null)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: Tokens.spaceMd),
              child: LikeQuotaBanner(
                subscription: subscription.value!,
                onUpgrade: () => Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => const SubscriptionScreen()),
                ),
              ),
            ),
          Expanded(
            child: AsyncView(
              value: feed,
              onRetry: () => ref.invalidate(feedProvider),
              isEmpty: (cards) => cards.isEmpty,
              emptyLabel: 'No new profiles right now. Widen your filters or check back later.',
              builder: (cards) => _FeedListView(
                cards: cards,
                controller: _scrollController,
              ),
            ),
          ),
        ],
      ),
    );
  }

  static Future<void> _showFilters(BuildContext context, WidgetRef ref) async {
    final current = ref.read(feedFiltersProvider);
    var minAge = current.minAge;
    var maxAge = current.maxAge;
    var radius = current.radiusKm?.toDouble();

    await showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (sheetContext) => StatefulBuilder(
        builder: (context, setSheetState) => Padding(
          padding: const EdgeInsets.all(Tokens.spaceMd),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const SectionHeader('Age range'),
              RangeSlider(
                values: RangeValues(minAge.toDouble(), maxAge.toDouble()),
                min: 18,
                max: 80,
                divisions: 62,
                labels: RangeLabels('$minAge', '$maxAge'),
                onChanged: (v) => setSheetState(() {
                  minAge = v.start.round();
                  maxAge = v.end.round();
                }),
              ),
              const SectionHeader('Distance'),
              Slider(
                value: radius ?? 200,
                min: 1,
                max: 200,
                label: radius == null ? 'Any' : '${radius!.round()} km',
                onChanged: (v) => setSheetState(() => radius = v),
              ),
              Text(
                radius == null ? 'Any distance' : 'Within ${radius!.round()} km',
                style: Theme.of(context).textTheme.bodySmall,
              ),
              const SizedBox(height: Tokens.spaceMd),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => setSheetState(() => radius = null),
                      child: const Text('Any distance'),
                    ),
                  ),
                  const SizedBox(width: Tokens.spaceSm),
                  Expanded(
                    child: FilledButton(
                      onPressed: () {
                        ref.read(feedFiltersProvider.notifier).state =
                            FeedFilters(minAge: minAge, maxAge: maxAge, radiusKm: radius?.round());
                        ref.invalidate(feedProvider);
                        Navigator.of(sheetContext).pop();
                      },
                      child: const Text('Apply'),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// List view of feed cards with pagination support.
class _FeedListView extends ConsumerWidget {
  const _FeedListView({
    required this.cards,
    required this.controller,
  });

  final List<FeedCard> cards;
  final ScrollController controller;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final subscription = ref.watch(subscriptionProvider).valueOrNull;
    final likesAvailable = subscription?.canSendLikes ?? true;

    return ListView.builder(
      controller: controller,
      padding: const EdgeInsets.all(Tokens.spaceMd),
      itemCount: cards.length + 1, // +1 for loading indicator at end
      itemBuilder: (context, index) {
        if (index == cards.length) {
          // Loading indicator at end of list
          return Center(
            child: Padding(
              padding: const EdgeInsets.all(Tokens.spaceMd),
              child: SizedBox(
                width: 24,
                height: 24,
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
            ),
          );
        }
        final card = cards[index];
        return _FeedCardView(
          card: card,
          likesAvailable: likesAvailable,
          onLike: () => _like(context, ref, card),
          onPass: () => _pass(context, ref, card),
          onBlock: () => _blockSheet(context, ref, card),
        );
      },
    );
  }

  Future<void> _pass(BuildContext context, WidgetRef ref, FeedCard card) async {
    try {
      await ref.read(feedProvider.notifier).pass(card);
    } catch (e) {
      if (context.mounted) _snack(context, messageFor(e));
    }
  }

  Future<void> _like(BuildContext context, WidgetRef ref, FeedCard card) async {
    try {
      final result = await ref.read(feedProvider.notifier).like(card);
      if (!context.mounted || result == null) return;
      _snack(context, result.matched ? 'It\'s a match!' : 'Like sent.');
    } catch (e) {
      if (context.mounted) _snack(context, messageFor(e));
    }
  }

  Future<void> _blockSheet(BuildContext context, WidgetRef ref, FeedCard card) async {
    const reasons = [...kReportReasons, 'Other'];

    final choice = await showModalBottomSheet<({String reason, bool block})>(
      context: context,
      showDragHandle: true,
      builder: (sheetContext) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SectionHeader('Report or block'),
            for (final reason in reasons)
              ListTile(
                title: Text(reason),
                onTap: () => Navigator.of(sheetContext).pop((reason: reason, block: false)),
              ),
            const Divider(),
            ListTile(
              leading: const Icon(Icons.block),
              title: const Text('Block this person'),
              subtitle: const Text('Removes them from your feed and ends any match'),
              onTap: () => Navigator.of(sheetContext).pop((reason: 'Blocked', block: true)),
            ),
          ],
        ),
      ),
    );
    if (choice == null) return;

    try {
      final api = ref.read(apiProvider);
      if (choice.block) {
        await ref.read(feedProvider.notifier).block(card, reason: choice.reason);
      } else {
        await api.post('/reports', body: {'reportedId': card.userId, 'reason': choice.reason});
      }
      if (context.mounted) _snack(context, choice.block ? 'Blocked.' : 'Thanks — we will review this.');
    } catch (e) {
      if (context.mounted) _snack(context, messageFor(e));
    }
  }

  static void _snack(BuildContext context, String message) =>
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
}

/// Individual feed card view.
class _FeedCardView extends ConsumerWidget {
  const _FeedCardView({
    required this.card,
    required this.likesAvailable,
    required this.onLike,
    required this.onPass,
    required this.onBlock,
  });

  final FeedCard card;
  final bool likesAvailable;
  final VoidCallback onLike;
  final VoidCallback onPass;
  final VoidCallback onBlock;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final subscription = ref.watch(subscriptionProvider).valueOrNull;

    return Padding(
      padding: const EdgeInsets.only(bottom: Tokens.spaceMd),
      child: Column(
        children: [
          Card(
            clipBehavior: Clip.antiAlias,
            child: Stack(
              fit: StackFit.expand,
              children: [
                ProfilePhoto(url: card.primaryPhoto, label: '${card.displayName}, ${card.age ?? ''}'),
                // Scrim keeps the overlay legible over any photo.
                const DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.center,
                      end: Alignment.bottomCenter,
                      colors: [Colors.transparent, Colors.black87],
                    ),
                  ),
                ),
                Positioned(
                  left: Tokens.spaceMd,
                  right: Tokens.spaceMd,
                  bottom: Tokens.spaceMd,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      ProfileNameBadge(
                        name: card.displayName,
                        age: card.age,
                        verification: card.verification,
                        style: theme.textTheme.headlineSmall?.copyWith(color: Colors.white),
                      ),
                      if (card.profession != null)
                        Text(card.profession!, style: theme.textTheme.bodyMedium?.copyWith(color: Colors.white70)),
                      const SizedBox(height: Tokens.spaceXs),
                      Wrap(
                        spacing: Tokens.spaceSm,
                        children: [
                          if (card.sharedInterests > 0)
                            _Pill('${card.sharedInterests} shared interests'),
                          if (card.distanceKm != null)
                            _Pill('${card.distanceKm!.round()} km away'),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: Tokens.spaceSm),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
            children: [
              _Action(
                icon: Icons.close,
                label: 'Pass',
                onPressed: onPass,
              ),
              _Action(
                icon: Icons.favorite,
                label: 'Like',
                emphasized: true,
                onPressed: likesAvailable ? onLike : null,
              ),
              _Action(
                icon: Icons.block,
                label: 'Block',
                onPressed: onBlock,
              ),
            ],
          ),
          if (!likesAvailable && subscription != null)
            Padding(
              padding: const EdgeInsets.only(top: Tokens.spaceXs),
              child: Text(
                subscription.isActive
                    ? 'Out of likes today — more tomorrow.'
                    : 'Your subscription has lapsed. Your chats are still here.',
                style: theme.textTheme.bodySmall,
                textAlign: TextAlign.center,
              ),
            ),
        ],
      ),
    )
        // Keyed by user so the entrance replays for the next card rather than
        // animating once for the first profile shown.
        .animate(key: ValueKey(card.userId))
        .fadeIn(duration: 250.ms)
        .slideY(begin: 0.04, curve: Curves.easeOut);
  }
}

class _Pill extends StatelessWidget {
  const _Pill(this.text);

  final String text;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: Tokens.spaceSm, vertical: 2),
        decoration: BoxDecoration(
          color: Colors.white24,
          borderRadius: const BorderRadius.all(Radius.circular(Tokens.radiusLg)),
        ),
        child: Text(text, style: const TextStyle(color: Colors.white, fontSize: 12)),
      );
}

class _Action extends StatelessWidget {
  const _Action({
    required this.icon,
    required this.label,
    required this.onPressed,
    this.emphasized = false,
  });

  final IconData icon;
  final String label;
  final VoidCallback? onPressed;
  final bool emphasized;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final disabled = onPressed == null;
    final background = disabled
        ? scheme.surfaceContainerHighest
        : emphasized
            ? scheme.primary
            : scheme.surfaceContainerHigh;
    final foreground = disabled
        ? scheme.onSurfaceVariant
        : emphasized
            ? scheme.onPrimary
            : scheme.onSurface;

    return Semantics(
      button: true,
      enabled: !disabled,
      label: label,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          IconButton.filled(
            onPressed: onPressed,
            icon: Icon(icon),
            style: IconButton.styleFrom(
              backgroundColor: background,
              foregroundColor: foreground,
              minimumSize: const Size(56, 56),
            ),
          ),
          Text(label, style: Theme.of(context).textTheme.labelSmall),
        ],
      ),
    );
  }
}