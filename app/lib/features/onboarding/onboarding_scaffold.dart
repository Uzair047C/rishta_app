import 'package:flutter/material.dart';

import '../../core/theme.dart';

/// Reusable shell for all onboarding questions.
/// Provides progress bar, back button, help icon, and bottom action slot.
class OnboardingScaffold extends StatelessWidget {
  const OnboardingScaffold({
    super.key,
    required this.currentStep,
    required this.totalSteps,
    this.onBack,
    this.onHelp,
    this.helpText,
    this.helpTitle,
    required this.child,
    this.bottomAction,
    this.showProgress = true,
  });

  final int currentStep; // 0-based
  final int totalSteps;
  final VoidCallback? onBack;
  final VoidCallback? onHelp;
  final String? helpText;
  final String? helpTitle;
  final Widget child;
  final Widget? bottomAction;
  final bool showProgress;

  void _handleHelp(BuildContext context) {
    if (onHelp != null) {
      onHelp!();
      return;
    }
    if (helpText != null) {
      showHelpSheet(
        context,
        title: helpTitle ?? 'Why do we ask this?',
        message: helpText!,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final progress = ((currentStep + 1) / totalSteps).clamp(0.0, 1.0);

    return Scaffold(
      backgroundColor: Tokens.tanBase,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        leading: currentStep > 0
            ? IconButton(
                icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 20),
                color: Tokens.pinkDeep,
                onPressed: onBack ?? () => Navigator.of(context).maybePop(),
                tooltip: 'Back',
              )
            : const SizedBox.shrink(),
        actions: [
          if (onHelp != null || helpText != null)
            IconButton(
              icon: Container(
                padding: const EdgeInsets.all(4),
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  border: Border.all(color: Tokens.pinkDeep.withValues(alpha: 0.5), width: 1.5),
                ),
                child: const Icon(Icons.question_mark_rounded, size: 14, color: Tokens.pinkDeep),
              ),
              onPressed: () => _handleHelp(context),
              tooltip: 'Why do we ask this?',
            ),
          const SizedBox(width: Tokens.spaceSm),
        ],
      ),
      body: SafeArea(
        child: Column(
          children: [
            if (showProgress)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: Tokens.spaceLg),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(Tokens.radiusPill),
                  child: LinearProgressIndicator(
                    value: progress,
                    minHeight: 4,
                    backgroundColor: Tokens.pinkLight.withValues(alpha: 0.35),
                    valueColor: const AlwaysStoppedAnimation(Tokens.pink),
                  ),
                ),
              ),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(Tokens.spaceLg, Tokens.spaceMd, Tokens.spaceLg, 0),
                child: child,
              ),
            ),
            if (bottomAction != null)
              Padding(
                padding: const EdgeInsets.fromLTRB(Tokens.spaceLg, Tokens.spaceSm, Tokens.spaceLg, Tokens.spaceLg),
                child: bottomAction,
              ),
          ],
        ),
      ),
    );
  }
}

/// Modal help sheet explaining sensitive questions like sect/ethnicity/marital status.
void showHelpSheet(BuildContext context, {required String title, required String message}) {
  showModalBottomSheet<void>(
    context: context,
    backgroundColor: Colors.transparent,
    isScrollControlled: true,
    builder: (ctx) => Container(
      padding: const EdgeInsets.fromLTRB(Tokens.spaceLg, Tokens.spaceMd, Tokens.spaceLg, Tokens.spaceXl),
      decoration: const BoxDecoration(
        color: Tokens.tanCard,
        borderRadius: BorderRadius.vertical(top: Radius.circular(Tokens.radiusLg)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 40,
            height: 4,
            decoration: BoxDecoration(
              color: Tokens.pinkDeep.withValues(alpha: 0.2),
              borderRadius: BorderRadius.circular(4),
            ),
          ),
          const SizedBox(height: Tokens.spaceLg),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Tokens.pinkLight.withValues(alpha: 0.25),
              shape: BoxShape.circle,
            ),
            child: const Icon(Icons.privacy_tip_outlined, color: Tokens.pink, size: 28),
          ),
          const SizedBox(height: Tokens.spaceMd),
          Text(
            title,
            style: Theme.of(ctx).textTheme.titleMedium?.copyWith(
                  color: Tokens.pinkDeep,
                  fontWeight: FontWeight.w800,
                ),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: Tokens.spaceMd),
          Text(
            message,
            style: Theme.of(ctx).textTheme.bodyMedium?.copyWith(
                  color: Colors.brown.shade800,
                  height: 1.45,
                ),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: Tokens.spaceLg),
          FilledButton(
            onPressed: () => Navigator.pop(ctx),
            style: FilledButton.styleFrom(
              backgroundColor: Tokens.pink,
              minimumSize: const Size.fromHeight(48),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Tokens.radiusMd)),
            ),
            child: const Text('Got it', style: TextStyle(fontWeight: FontWeight.w700)),
          ),
        ],
      ),
    ),
  );
}
