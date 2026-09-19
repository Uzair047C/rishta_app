import 'package:flutter/material.dart';

import '../../core/theme.dart';
import 'onboarding_scaffold.dart';

/// Option for a single-select group.
class GroupOption {
  const GroupOption({required this.id, required this.label, this.icon});
  final dynamic id;
  final String label;
  final IconData? icon;
}

/// Screen with two single-select groups, each requiring an answer.
/// Used for marriage intentions (step 6).
class DualGroupScreen extends StatefulWidget {
  const DualGroupScreen({
    super.key,
    required this.title,
    required this.groupA,
    required this.groupB,
    required this.onContinue,
    this.currentStep = 0,
    this.totalSteps = 14,
    this.helpText,
  });

  final String title;
  final GroupConfig groupA;
  final GroupConfig groupB;
  final void Function(dynamic groupAValue, dynamic groupBValue) onContinue;
  final int currentStep;
  final int totalSteps;
  final String? helpText;

  @override
  State<DualGroupScreen> createState() => _DualGroupScreenState();
}

class GroupConfig {
  const GroupConfig({required this.title, required this.options});
  final String title;
  final List<GroupOption> options;
}

class _DualGroupScreenState extends State<DualGroupScreen> {
  dynamic _selectedA;
  dynamic _selectedB;

  @override
  void initState() {
    super.initState();
  }

  @override
  Widget build(BuildContext context) {
    final canContinue = _selectedA != null && _selectedB != null;

    return OnboardingScaffold(
      currentStep: widget.currentStep,
      totalSteps: widget.totalSteps,
      onBack: () => Navigator.of(context).pop(),
      onHelp: widget.helpText != null ? () => _showHelp(context) : null,
      showProgress: true,
      bottomAction: FilledButton(
        onPressed: canContinue ? () => widget.onContinue(_selectedA!, _selectedB!) : null,
        style: FilledButton.styleFrom(
          minimumSize: const Size.fromHeight(52),
          backgroundColor: Tokens.pink,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Tokens.radiusMd)),
        ),
        child: const Text('Continue', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(widget.title, style: Theme.of(context).textTheme.headlineSmall?.copyWith(color: Tokens.pinkDeep, fontWeight: FontWeight.w800)),
          const SizedBox(height: Tokens.spaceLg),
          Expanded(
            child: SingleChildScrollView(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _buildGroup(widget.groupA, _selectedA, (v) => setState(() => _selectedA = v)),
                  const SizedBox(height: Tokens.spaceXl),
                  _buildGroup(widget.groupB, _selectedB, (v) => setState(() => _selectedB = v)),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildGroup(GroupConfig group, dynamic selected, void Function(dynamic) onSelect) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(group.title, style: Theme.of(context).textTheme.titleMedium?.copyWith(color: Tokens.pinkDeep, fontWeight: FontWeight.w700)),
          const SizedBox(height: Tokens.spaceMd),
          ListView.separated(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: group.options.length,
            separatorBuilder: (_, __) => const SizedBox(height: Tokens.spaceSm),
            itemBuilder: (_, i) {
              final opt = group.options[i];
              final isSelected = selected == opt.id;
              return Material(
                color: isSelected ? Tokens.pinkLight.withValues(alpha: 0.3) : Tokens.tanCard,
                borderRadius: BorderRadius.circular(Tokens.radiusMd),
                child: InkWell(
                  onTap: () => onSelect(opt.id),
                  borderRadius: BorderRadius.circular(Tokens.radiusMd),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: Tokens.spaceMd, vertical: Tokens.spaceMd),
                    child: Row(
                      children: [
                        if (opt.icon != null) ...[Icon(opt.icon, color: Tokens.pink, size: 20), const SizedBox(width: Tokens.spaceSm)],
                        Expanded(child: Text(opt.label, style: TextStyle(fontSize: 15, color: Tokens.pinkDeep, fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500))),
                        if (isSelected) const Icon(Icons.check_circle, color: Tokens.pink, size: 22),
                      ],
                    ),
                  ),
                ),
              );
            },
          ),
        ],
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
            Text(widget.helpText!, style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: Tokens.pinkDeep), textAlign: TextAlign.center),
            const SizedBox(height: Tokens.spaceLg),
            FilledButton(onPressed: () => Navigator.pop(context), child: const Text('Got it')),
          ],
        ),
      ),
    );
  }
}