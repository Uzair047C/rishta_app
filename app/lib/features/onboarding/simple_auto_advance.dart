import 'package:flutter/material.dart';

import '../../core/theme.dart';
import 'onboarding_scaffold.dart';

/// Simple single-select list with auto-advance on tap.
/// Used for: sect, marital status, alcohol, move abroad.
class SimpleAutoAdvanceScreen extends StatelessWidget {
  const SimpleAutoAdvanceScreen({
    super.key,
    required this.title,
    required this.options,
    required this.onSelect,
    this.currentStep = 0,
    this.totalSteps = 14,
    this.helpText,
  });

  final String title;
  final List<String> options;
  final void Function(String selected) onSelect;
  final int currentStep;
  final int totalSteps;
  final String? helpText;

  @override
  Widget build(BuildContext context) => OnboardingScaffold(
        currentStep: currentStep,
        totalSteps: totalSteps,
        onBack: () => Navigator.of(context).pop(),
        onHelp: helpText != null ? () => _showHelp(context) : null,
        showProgress: true,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: Theme.of(context).textTheme.headlineSmall?.copyWith(color: Tokens.pinkDeep, fontWeight: FontWeight.w800)),
            const SizedBox(height: Tokens.spaceLg),
            Expanded(
              child: ListView.separated(
                itemCount: options.length,
                separatorBuilder: (_, __) => const SizedBox(height: Tokens.spaceSm),
                itemBuilder: (_, i) => _OptionTile(
                  text: options[i],
                  onTap: () => onSelect(options[i]),
                ),
              ),
            ),
          ],
        ),
      );

  void _showHelp(BuildContext context) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (_) => Container(
        padding: const EdgeInsets.all(Tokens.spaceLg),
        decoration: const BoxDecoration(
          color: Tokens.tanCard,
          borderRadius: BorderRadius.vertical(top: Radius.circular(Tokens.radiusLg)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(width: 40, height: 4, decoration: BoxDecoration(color: Tokens.pink.withValues(alpha: 0.3), borderRadius: BorderRadius.circular(4))),
            const SizedBox(height: Tokens.spaceMd),
            Text('Why this question?', style: Theme.of(context).textTheme.titleMedium?.copyWith(color: Tokens.pinkDeep, fontWeight: FontWeight.w700)),
            const SizedBox(height: Tokens.spaceMd),
            Text(helpText!, style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: Tokens.pinkDeep), textAlign: TextAlign.center),
            const SizedBox(height: Tokens.spaceLg),
            FilledButton(onPressed: () => Navigator.pop(context), child: const Text('Got it')),
          ],
        ),
      ),
    );
  }
}

class _OptionTile extends StatelessWidget {
  const _OptionTile({required this.text, required this.onTap});

  final String text;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Material(
        color: Tokens.tanCard,
        borderRadius: BorderRadius.circular(Tokens.radiusMd),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(Tokens.radiusMd),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: Tokens.spaceMd, vertical: Tokens.spaceMd),
            child: Row(
              children: [
                Expanded(child: Text(text, style: TextStyle(fontSize: 16, color: Tokens.pinkDeep, fontWeight: FontWeight.w500))),
                const Icon(Icons.arrow_forward_ios_rounded, size: 18, color: Tokens.pink),
              ],
            ),
          ),
        ),
      );
}