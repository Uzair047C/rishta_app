import 'package:flutter/material.dart';

import '../../core/theme.dart';
import 'onboarding_scaffold.dart';

/// Photo guidelines education screen (step 13).
/// Shows do's and don'ts with example icons.
class PhotoGuidelinesScreen extends StatelessWidget {
  const PhotoGuidelinesScreen({
    super.key,
    required this.onContinue,
    this.currentStep = 0,
    this.totalSteps = 14,
    this.helpText,
  });

  final VoidCallback onContinue;
  final int currentStep;
  final int totalSteps;
  final String? helpText;

  static const _doItems = [
    _GuidelineItem('Only show yourself', Icons.person_outline_rounded, true),
    _GuidelineItem('Clear face', Icons.face_outlined, true),
    _GuidelineItem('Good lighting', Icons.wb_sunny_outlined, true),
    _GuidelineItem('Recent photo', Icons.event_outlined, true),
  ];

  static const _dontItems = [
    _GuidelineItem('Not a person', Icons.block_outlined, false),
    _GuidelineItem('Face covered', Icons.face_retouching_natural_outlined, false),
    _GuidelineItem('Far away', Icons.zoom_out_map_outlined, false),
    _GuidelineItem('AI images & filters', Icons.auto_awesome_outlined, false),
  ];

  @override
  Widget build(BuildContext context) => OnboardingScaffold(
        currentStep: currentStep,
        totalSteps: totalSteps,
        onBack: () => Navigator.of(context).pop(),
        onHelp: helpText != null ? () => _showHelp(context) : null,
        showProgress: true,
        bottomAction: FilledButton(
          onPressed: onContinue,
          style: FilledButton.styleFrom(
            minimumSize: const Size.fromHeight(52),
            backgroundColor: Tokens.pink,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Tokens.radiusMd)),
          ),
          child: const Text('Add photo', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Photo guidelines', style: Theme.of(context).textTheme.headlineSmall?.copyWith(color: Tokens.pinkDeep, fontWeight: FontWeight.w800)),
            const SizedBox(height: Tokens.spaceSm),
            Text('Better photos = better matches. Here\'s what works:', style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: Colors.brown.shade500)),
            const SizedBox(height: Tokens.spaceLg),
            // Do's section
            _buildSection('Use high-quality photos', Icons.check_circle_outline, Colors.green.shade700, _doItems, true),
            const SizedBox(height: Tokens.spaceXl),
            // Don'ts section
            _buildSection('Avoid these mistakes', Icons.cancel_outlined, Colors.red.shade700, _dontItems, false),
          ],
        ),
      );

  Widget _buildSection(String title, IconData titleIcon, Color titleColor, List<_GuidelineItem> items, bool isPositive) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(titleIcon, color: titleColor, size: 22),
            const SizedBox(width: Tokens.spaceSm),
            Text(title, style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: titleColor)),
          ],
        ),
        const SizedBox(height: Tokens.spaceMd),
        ...items.map((item) => Padding(
              padding: const EdgeInsets.only(bottom: Tokens.spaceMd),
              child: Row(
                children: [
                  Container(
                    width: 40,
                    height: 40,
                    decoration: BoxDecoration(
                      color: isPositive ? Colors.green.shade50 : Colors.red.shade50,
                      borderRadius: BorderRadius.circular(Tokens.radiusMd),
                    ),
                    child: Icon(item.icon, color: isPositive ? Colors.green.shade700 : Colors.red.shade700, size: 20),
                  ),
                  const SizedBox(width: Tokens.spaceMd),
                  Expanded(child: Text(item.label, style: TextStyle(fontSize: 14, color: Tokens.pinkDeep))),
                  Icon(item.isGood ? Icons.check_circle : Icons.cancel, color: isPositive ? Colors.green.shade700 : Colors.red.shade700, size: 20),
                ],
              ),
            )),
      ],
    );
  }

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

class _GuidelineItem {
  const _GuidelineItem(this.label, this.icon, this.isGood);
  final String label;
  final IconData icon;
  final bool isGood;
}