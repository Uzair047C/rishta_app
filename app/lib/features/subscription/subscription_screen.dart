import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:purchases_flutter/purchases_flutter.dart';

import '../../core/models.dart';
import '../../core/providers.dart';
import '../../core/purchases.dart';
import '../../core/theme.dart';
import '../../core/widgets.dart';

/// Subscription status and upsell.
///
/// Spec 1.2 — the screen must make clear that a lapse gates *new likes only*.
/// Existing matches and chats stay open, so nothing here offers to "restore"
/// them; there is nothing to restore.
class SubscriptionScreen extends ConsumerStatefulWidget {
  const SubscriptionScreen({super.key});

  @override
  ConsumerState<SubscriptionScreen> createState() => _SubscriptionScreenState();
}

class _SubscriptionScreenState extends ConsumerState<SubscriptionScreen> {
  static const _plans = [
    (id: 'rishta_plus_monthly', name: 'Plus', priceLabel: 'monthly', likes: 50),
    (id: 'rishta_gold_monthly', name: 'Gold', priceLabel: 'monthly', likes: 999),
  ];

  /// Real store prices when billing is available; null falls back to the
  /// hard-coded cards so dev builds without API keys still render the screen.
  late final Future<Offerings?> _offerings = _loadOfferings();

  Future<Offerings?> _loadOfferings() async {
    try {
      final me = await ref.read(myProfileProvider.future);
      await PurchasesService.init(me.userId);
      if (!PurchasesService.available) return null;
      return await PurchasesService.fetchOfferings();
    } catch (_) {
      return null; // offerings are a price upgrade; the fallback covers failure
    }
  }

  Future<void> _purchase(Package package) async {
    final messenger = ScaffoldMessenger.of(context);
    try {
      final completed = await PurchasesService.purchase(package);
      if (!completed || !mounted) return; // user cancelled: nothing to say
      ref.invalidate(subscriptionProvider); // server truth arrives via webhook
      messenger.showSnackBar(const SnackBar(content: Text('Subscription updated.')));
    } catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(messageFor(e))));
    }
  }

  void _billingUnavailable() {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Billing unavailable in this build.')),
    );
  }

  @override
  Widget build(BuildContext context) {
    final subscription = ref.watch(subscriptionProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Subscription')),
      body: AsyncView(
        value: subscription,
        onRetry: () => ref.invalidate(subscriptionProvider),
        builder: (sub) => ListView(
          padding: const EdgeInsets.all(Tokens.spaceMd),
          children: [
            _StatusCard(subscription: sub),
            const SizedBox(height: Tokens.spaceLg),

            if (!sub.isActive) ...[
              Card(
                color: Theme.of(context).colorScheme.secondaryContainer,
                child: const Padding(
                  padding: EdgeInsets.all(Tokens.spaceMd),
                  child: Row(
                    children: [
                      Icon(Icons.lock_open),
                      SizedBox(width: Tokens.spaceMd),
                      Expanded(
                        child: Text(
                          'Your matches and chats are unaffected. Only sending new likes is paused.',
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: Tokens.spaceLg),
            ],

            FutureBuilder<Offerings?>(
              future: _offerings,
              builder: (context, snapshot) {
                final offering = snapshot.data;
                final matched = offering == null
                    ? null
                    : [
                        for (final plan in _plans)
                          for (final package in offering.current?.availablePackages ?? const <Package>[])
                            if (package.storeProduct.identifier == plan.id) (plan, package),
                      ];
                return Column(
                  children: [
                    const SectionHeader('Plans'),
                    if (matched != null && matched.isNotEmpty)
                      for (final (plan, package) in matched)
                        Card(
                          child: ListTile(
                            title: Text(plan.name),
                            subtitle: Text(
                              '${plan.likes}+ likes a day · ${package.storeProduct.priceString}',
                            ),
                            trailing: FilledButton(
                              onPressed: () => _purchase(package),
                              child: const Text('Choose'),
                            ),
                          ),
                        )
                    else
                      for (final plan in _plans)
                        Card(
                          child: ListTile(
                            title: Text(plan.name),
                            subtitle:
                                Text('${plan.likes}+ likes a day · billed ${plan.priceLabel}'),
                            trailing: FilledButton(
                              onPressed: _billingUnavailable,
                              child: const Text('Choose'),
                            ),
                          ),
                        ),
                  ],
                );
              },
            ),
            const SizedBox(height: Tokens.spaceLg),
          ],
        ),
      ),
    );
  }
}

class _StatusCard extends StatelessWidget {
  const _StatusCard({required this.subscription});

  final Subscription subscription;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final sub = subscription;
    final renewal = sub.renewsAt == null ? null : DateFormat.yMMMMd().format(sub.renewsAt!);

    return Card(
      color: sub.isActive ? scheme.primaryContainer : scheme.surfaceContainerHighest,
      child: Padding(
        padding: const EdgeInsets.all(Tokens.spaceMd),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              sub.isActive ? '${_titleCase(sub.plan)} plan' : 'No active plan',
              style: theme.textTheme.titleLarge,
            ),
            const SizedBox(height: Tokens.spaceSm),
            Text(
              sub.isActive
                  ? '${sub.likesRemainingToday} of ${sub.dailyAllowance} likes remaining today'
                  : 'Subscribe to start sending likes again',
              style: theme.textTheme.bodyLarge,
            ),
            if (renewal != null) ...[
              const SizedBox(height: Tokens.spaceXs),
              Text(sub.isActive ? 'Renews $renewal' : 'Lapsed $renewal', style: theme.textTheme.bodySmall),
            ],
            if (sub.quotaResetAt != null) ...[
              const SizedBox(height: Tokens.spaceXs),
              Text(
                'Likes reset ${DateFormat.jm().format(sub.quotaResetAt!)}',
                style: theme.textTheme.bodySmall,
              ),
            ],
          ],
        ),
      ),
    );
  }

  static String _titleCase(String value) =>
      value.isEmpty ? value : value[0].toUpperCase() + value.substring(1);
}
