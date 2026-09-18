import 'package:flutter/material.dart';

import '../../core/theme.dart';
import 'onboarding_scaffold.dart';

/// Card-style single-select option with title + description.
/// Used for religious practice level.
class CardOption {
  const CardOption({required this.id, required this.title, required this.description, this.icon});
  final dynamic id;
  final String title;
  final String description;
  final IconData? icon;
}

/// Card-style single-select screen with auto-advance on tap.
class CardSingleSelectScreen extends StatelessWidget {
  const CardSingleSelectScreen({
    super.key,
    required this.title,
    required this.options,
    required this.onSelect,
    this.currentStep = 0,
    this.totalSteps = 14,
    this.helpText,
  });

  final String title;
  final List<CardOption> options;
  final void Function(dynamic selected) onSelect;
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
                separatorBuilder: (_, __) => const SizedBox(height: Tokens.spaceMd),
                itemBuilder: (_, i) => _CardOptionTile(
                  option: options[i],
                  onTap: () => onSelect(options[i].id),
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

class _CardOptionTile extends StatelessWidget {
  const _CardOptionTile({required this.option, required this.onTap});

  final CardOption option;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Material(
        color: Tokens.tanCard,
        borderRadius: BorderRadius.circular(Tokens.radiusLg),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(Tokens.radiusLg),
          child: Padding(
            padding: const EdgeInsets.all(Tokens.spaceMd),
            child: Row(
              children: [
                if (option.icon != null) ...[
                  Container(
                    width: 48,
                    height: 48,
                    decoration: BoxDecoration(
                      color: Tokens.pinkLight.withValues(alpha: 0.3),
                      borderRadius: BorderRadius.circular(Tokens.radiusMd),
                    ),
                    child: Icon(option.icon, color: Tokens.pink, size: 24),
                  ),
                  const SizedBox(width: Tokens.spaceMd),
                ],
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(option.title, style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: Tokens.pinkDeep)),
                      const SizedBox(height: 4),
                      Text(option.description, style: TextStyle(fontSize: 13, color: Colors.brown.shade500)),
                    ],
                  ),
                ),
                const Icon(Icons.arrow_forward_ios_rounded, size: 18, color: Tokens.pink),
              ],
            ),
          ),
        ),
      );
}