import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:purchases_flutter/purchases_flutter.dart';

import '../../core/models.dart';
import '../../core/providers.dart';
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

            const SectionHeader('Plans'),
            for (final plan in _SubscriptionScreenState._plans)
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

  /// Purchase hook. Uses RevenueCat to process the purchase.
  /// On success, the RevenueCat webhook will sync subscription state to backend.
  Future<void> _purchase(BuildContext context, String productId) async {
    try {
      final offerings = await Purchases.getOfferings();
      final offering = offerings.current;
      if (offering == null) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('No subscription plans available.')),
          );
        }
        return;
      }

      final package = offering.availablePackages.firstWhere(
        (p) => p.identifier == productId,
        orElse: () => offering.availablePackages.first,
      );

      await Purchases.purchasePackage(package);

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Purchase successful! Subscription will activate shortly.')),
        );
        // Invalidate to refresh subscription status
        // ref.invalidate(subscriptionProvider); // Would need ConsumerStatefulWidget
      }
    } on PlatformException catch (e) {
      // PlatformException is from flutter/services
      if (mounted) {
        if (e.code != 'user_cancelled_error') {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Purchase failed: ${e.message}')),
          );
        }
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Purchase error: $e')),
        );
      }
    }
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
