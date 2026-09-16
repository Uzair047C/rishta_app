import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/models.dart';
import '../../core/providers.dart';
import '../../core/theme.dart';
import '../../core/widgets.dart';

/// Subscription status and upsell.
///
/// Spec 1.2 — the screen must make clear that a lapse gates *new likes only*.
/// Existing matches and chats stay open, so nothing here offers to "restore"
/// them; there is nothing to restore.
class SubscriptionScreen extends ConsumerWidget {
  const SubscriptionScreen({super.key});

  static const _plans = [
    (id: 'rishta_plus_monthly', name: 'Plus', priceLabel: 'monthly', likes: 50),
    (id: 'rishta_gold_monthly', name: 'Gold', priceLabel: 'monthly', likes: 999),
  ];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
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

            const SectionHeader('Plans'),
            for (final plan in _plans)
              Card(
                child: ListTile(
                  title: Text(plan.name),
                  subtitle: Text('${plan.likes}+ likes a day · billed ${plan.priceLabel}'),
                  trailing: FilledButton(
                    onPressed: () => _purchase(context, plan.id),
                    child: const Text('Choose'),
                  ),
                ),
              ),
            const SizedBox(height: Tokens.spaceLg),
          ],
        ),
      ),
    );
  }

  /// Purchase hook. The store integration (RevenueCat, wrapping Play Billing on
  /// Android and StoreKit on iOS) is the remaining piece of build step 7 — the
  /// server side it feeds is already live at POST /subscription/webhook.
  void _purchase(BuildContext context, String productId) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('Billing for "$productId" is not wired up yet.')),
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
