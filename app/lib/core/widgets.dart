import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'api.dart';
import 'models.dart';
import 'theme.dart';

/// Human-readable text for anything a provider can throw.
String messageFor(Object error) =>
    error is ApiException ? error.error.message : 'Something went wrong. Please try again.';

/// Renders an [AsyncValue] without every screen repeating the four states.
/// Generic over the loaded type, so one widget serves lists and single objects.
class AsyncView<T> extends StatelessWidget {
  const AsyncView({
    super.key,
    required this.value,
    required this.builder,
    this.onRetry,
    this.emptyLabel,
    this.isEmpty,
  });

  final AsyncValue<T> value;
  final Widget Function(T data) builder;
  final VoidCallback? onRetry;
  final String? emptyLabel;
  final bool Function(T data)? isEmpty;

  @override
  Widget build(BuildContext context) => value.when(
        data: (data) {
          if (isEmpty?.call(data) ?? false) {
            return EmptyView(label: emptyLabel ?? 'Nothing here yet.', onRetry: onRetry);
          }
          return builder(data);
        },
        loading: () => const LoadingView(),
        error: (error, _) => ErrorView(message: messageFor(error), onRetry: onRetry),
      );
}

class LoadingView extends StatelessWidget {
  const LoadingView({super.key});

  @override
  Widget build(BuildContext context) => const Center(
        child: CircularProgressIndicator(),
      );
}

class EmptyView extends StatelessWidget {
  const EmptyView({super.key, required this.label, this.onRetry});

  final String label;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(Tokens.spaceLg),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Semantics(
                label: label,
                child: Text(label, textAlign: TextAlign.center, style: Theme.of(context).textTheme.bodyLarge),
              ),
              if (onRetry != null) ...[
                const SizedBox(height: Tokens.spaceMd),
                TextButton(onPressed: onRetry, child: const Text('Try again')),
              ],
            ],
          ),
        ),
      );
}

class ErrorView extends StatelessWidget {
  const ErrorView({super.key, required this.message, this.onRetry});

  final String message;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(Tokens.spaceLg),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.error_outline, color: scheme.error, size: 40, semanticLabel: 'Error'),
            const SizedBox(height: Tokens.spaceMd),
            Text(message, textAlign: TextAlign.center, style: Theme.of(context).textTheme.bodyLarge),
            if (onRetry != null) ...[
              const SizedBox(height: Tokens.spaceMd),
              FilledButton.tonal(onPressed: onRetry, child: const Text('Try again')),
            ],
          ],
        ),
      ),
    );
  }
}

/// Network photo with a graceful placeholder. Every photo carries a semantic
/// label — an unlabelled image is invisible to a screen reader.
class ProfilePhoto extends StatelessWidget {
  const ProfilePhoto({super.key, required this.url, this.label = 'Profile photo', this.fit = BoxFit.cover});

  final String? url;
  final String label;
  final BoxFit fit;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    if (url == null || url!.isEmpty) {
      return Semantics(
        label: 'No $label',
        child: Container(color: scheme.surfaceContainerHighest, child: const Icon(Icons.person_outline, size: 48)),
      );
    }
    return Semantics(
      image: true,
      label: label,
      child: CachedNetworkImage(
        imageUrl: url!,
        fit: fit,
        placeholder: (_, __) => Container(color: scheme.surfaceContainerHighest),
        errorWidget: (_, __, ___) => Container(
          color: scheme.surfaceContainerHighest,
          child: const Icon(Icons.broken_image_outlined),
        ),
      ),
    );
  }
}

/// Spec 1.2 — the remaining-likes count stays visible while browsing.
class LikeQuotaBanner extends StatelessWidget {
  const LikeQuotaBanner({super.key, required this.subscription, this.onUpgrade});

  final Subscription subscription;
  final VoidCallback? onUpgrade;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final exhausted = subscription.likesRemainingToday <= 0;

    return Semantics(
      liveRegion: true,
      label: exhausted
          ? 'No likes remaining today'
          : '${subscription.likesRemainingToday} likes remaining today',
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: Tokens.spaceMd, vertical: Tokens.spaceSm),
        decoration: BoxDecoration(
          color: exhausted ? scheme.errorContainer : scheme.primaryContainer,
          borderRadius: const BorderRadius.all(Radius.circular(Tokens.radiusLg)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              exhausted ? Icons.hourglass_empty : Icons.favorite,
              size: 18,
              color: exhausted ? scheme.onErrorContainer : scheme.onPrimaryContainer,
            ),
            const SizedBox(width: Tokens.spaceSm),
            Flexible(
              child: Text(
                exhausted
                    ? 'Out of likes — come back tomorrow'
                    : '${subscription.likesRemainingToday} of ${subscription.dailyAllowance} likes left',
                style: Theme.of(context).textTheme.labelLarge?.copyWith(
                      color: exhausted ? scheme.onErrorContainer : scheme.onPrimaryContainer,
                    ),
              ),
            ),
            if (exhausted && onUpgrade != null) ...[
              const SizedBox(width: Tokens.spaceSm),
              TextButton(onPressed: onUpgrade, child: const Text('Upgrade')),
            ],
          ],
        ),
      ),
    );
  }
}

class VerificationBadge extends StatelessWidget {
  const VerificationBadge({super.key, required this.status});

  final VerificationStatus status;

  @override
  Widget build(BuildContext context) {
    if (!status.isVerified) return const SizedBox.shrink();
    return Semantics(
      label: 'Verified profile',
      child: Icon(Icons.verified, size: 18, color: Theme.of(context).colorScheme.primary),
    );
  }
}

/// Section heading with consistent spacing, so screens do not each roll their own.
class SectionHeader extends StatelessWidget {
  const SectionHeader(this.title, {super.key, this.trailing});

  final String title;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: Tokens.spaceSm),
        child: Row(
          children: [
            Expanded(
              child: Text(title, style: Theme.of(context).textTheme.titleMedium),
            ),
            if (trailing != null) trailing!,
          ],
        ),
      );
}
