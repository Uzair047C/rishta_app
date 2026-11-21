import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme.dart';
import 'onboarding_scaffold.dart';

/// Gender selection screen (single select: Male, Female, Other).
class GenderScreen extends ConsumerStatefulWidget {
  const GenderScreen({
    super.key,
    required this.onConfirm,
    this.initialGender,
    this.currentStep = 0,
    this.totalSteps = 14,
    this.helpText,
  });

  final void Function(String gender) onConfirm;
  final String? initialGender;
  final int currentStep;
  final int totalSteps;
  final String? helpText;

  @override
  ConsumerState<GenderScreen> createState() => _GenderScreenState();
}

class _GenderScreenState extends ConsumerState<GenderScreen> {
  String? _selected;
  bool _busy = false;

  static const _options = [
    _GenderOption('Male', 'male', Icons.male_outlined),
    _GenderOption('Female', 'female', Icons.female_outlined),
    _GenderOption('Other', 'other', Icons.transgender_outlined),
  ];

  @override
  void initState() {
    super.initState();
    _selected = widget.initialGender;
  }

  void _submit() {
    if (_selected == null) return;
    setState(() => _busy = true);
    widget.onConfirm(_selected!);
  }

  @override
  Widget build(BuildContext context) => OnboardingScaffold(
        currentStep: widget.currentStep,
        totalSteps: widget.totalSteps,
        onBack: () => Navigator.of(context).pop(),
        onHelp: widget.helpText != null ? () => _showHelp(context) : null,
        showProgress: true,
        bottomAction: FilledButton(
          onPressed: _selected == null || _busy ? null : _submit,
          style: FilledButton.styleFrom(
            minimumSize: const Size.fromHeight(52),
            backgroundColor: Tokens.pink,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Tokens.radiusMd)),
          ),
          child: Text(_busy ? 'Saving…' : 'Continue', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('What\'s your gender?', style: Theme.of(context).textTheme.headlineSmall?.copyWith(color: Tokens.pinkDeep, fontWeight: FontWeight.w800)),
            const SizedBox(height: Tokens.spaceSm),
            Text('This helps us show you relevant matches.', style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: Colors.brown.shade500)),
            const SizedBox(height: Tokens.spaceLg),
            ..._options.map((opt) => _buildOption(opt)),
            const SizedBox(height: Tokens.spaceSm),
            Align(
              alignment: Alignment.centerRight,
              child: Text('Required', style: Theme.of(context).textTheme.bodySmall?.copyWith(color: Colors.brown.shade400)),
            ),
          ],
        ),
      );

  Widget _buildOption(_GenderOption opt) {
    final isSelected = _selected == opt.value;
    return Padding(
      padding: const EdgeInsets.only(bottom: Tokens.spaceSm),
      child: InkWell(
        onTap: () => setState(() => _selected = opt.value),
        borderRadius: BorderRadius.circular(Tokens.radiusMd),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 16, horizontal: Tokens.spaceMd),
          decoration: BoxDecoration(
            color: Tokens.tanCard,
            borderRadius: BorderRadius.circular(Tokens.radiusMd),
            border: Border.all(
              color: isSelected ? Tokens.pink : Tokens.pink.withValues(alpha: 0.25),
              width: isSelected ? 2 : 1.5,
            ),
          ),
          child: Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: isSelected ? Tokens.pinkLight.withValues(alpha: 0.3) : Colors.transparent,
                  shape: BoxShape.circle,
                ),
                child: Icon(opt.icon, color: isSelected ? Tokens.pink : Colors.brown.shade400, size: 22),
              ),
              const SizedBox(width: Tokens.spaceMd),
              Expanded(
                child: Text(
                  opt.label,
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
                    color: isSelected ? Tokens.pinkDeep : Colors.brown.shade700,
                  ),
                ),
              ),
              if (isSelected)
                Icon(Icons.check_circle, color: Tokens.pink, size: 24)
              else
                const SizedBox(width: 24, height: 24),
            ],
          ),
        ),
      ),
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
            Text(widget.helpText!, style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: Tokens.pinkDeep), textAlign: TextAlign.center),
            const SizedBox(height: Tokens.spaceLg),
            FilledButton(onPressed: () => Navigator.pop(context), child: const Text('Got it')),
          ],
        ),
      ),
    );
  }
}

class _GenderOption {
  const _GenderOption(this.label, this.value, this.icon);
  final String label;
  final String value;
  final IconData icon;
}