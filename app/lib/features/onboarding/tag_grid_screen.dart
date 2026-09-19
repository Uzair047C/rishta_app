import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/models.dart';
import '../../core/theme.dart';
import 'onboarding_scaffold.dart';

/// Reusable multi-select chip grid screen for interests and personality.
class TagGridScreen extends ConsumerStatefulWidget {
  const TagGridScreen({
    super.key,
    required this.title,
    required this.categories,
    required this.onConfirm,
    this.maxSelectable,
    this.isSkippable = false,
    this.onSkip,
    this.initialSelection = const {},
    this.currentStep = 0,
    this.totalSteps = 14,
    this.helpText,
  });

  final String title;
  final List<TagCategory> categories;
  final void Function(Set<dynamic> selected) onConfirm;
  final int? maxSelectable; // null = unlimited
  final bool isSkippable;
  final VoidCallback? onSkip;
  final Set<dynamic> initialSelection;
  final int currentStep;
  final int totalSteps;
  final String? helpText;

  @override
  ConsumerState<TagGridScreen> createState() => _TagGridScreenState();
}

class _TagGridScreenState extends ConsumerState<TagGridScreen> {
  late Set<dynamic> _selected;

  @override
  void initState() {
    super.initState();
    _selected = Set.from(widget.initialSelection);
  }

  void _toggle(dynamic id) {
    setState(() {
      if (_selected.contains(id)) {
        _selected.remove(id);
      } else {
        if (widget.maxSelectable != null && _selected.length >= widget.maxSelectable!) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Maximum ${widget.maxSelectable} selections allowed')),
          );
          return;
        }
        _selected.add(id);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final selectedCount = _selected.length;
    final canConfirm = selectedCount > 0;
    final maxText = widget.maxSelectable != null ? ' (max ${widget.maxSelectable})' : '';

    return OnboardingScaffold(
      currentStep: widget.currentStep,
      totalSteps: widget.totalSteps,
      onBack: () => Navigator.of(context).pop(),
      onHelp: widget.helpText != null ? () => _showHelp(context) : null,
      bottomAction: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          FilledButton(
            onPressed: canConfirm ? () => widget.onConfirm(_selected) : null,
            style: FilledButton.styleFrom(
              minimumSize: const Size.fromHeight(52),
              backgroundColor: Tokens.pink,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Tokens.radiusMd)),
            ),
            child: Text('Select ($selectedCount)$maxText', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
          ),
          if (widget.isSkippable && widget.onSkip != null) ...[
            const SizedBox(height: Tokens.spaceSm),
            TextButton(onPressed: widget.onSkip, child: const Text('Skip', style: TextStyle(fontSize: 14, color: Tokens.pinkDeep))),
          ],
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(widget.title, style: Theme.of(context).textTheme.headlineSmall?.copyWith(color: Tokens.pinkDeep, fontWeight: FontWeight.w800)),
          if (widget.maxSelectable != null) ...[
            const SizedBox(height: Tokens.spaceXs),
            Text('Select up to ${widget.maxSelectable} traits to show off your personality', style: Theme.of(context).textTheme.bodySmall?.copyWith(color: Colors.brown.shade400)),
          ],
          const SizedBox(height: Tokens.spaceLg),
          Expanded(
            child: ListView(
              children: [
                for (final category in widget.categories) ...[
                  if (category.name.isNotEmpty) ...[
                    Padding(
                      padding: const EdgeInsets.only(bottom: Tokens.spaceSm),
                      child: Text(category.name, style: TextStyle(fontWeight: FontWeight.w700, color: Tokens.pinkDeep, fontSize: 13)),
                    ),
                  ],
                  Wrap(
                    spacing: Tokens.spaceSm,
                    runSpacing: Tokens.spaceSm,
                    children: [
                      for (final tag in category.tags)
                        _buildChip(tag),
                    ],
                  ),
                  const SizedBox(height: Tokens.spaceLg),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildChip(TagItem tag) {
    final isSelected = _selected.contains(tag.id);

    return FilterChip(
      label: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (tag.icon != null) ...[Icon(tag.icon, size: 16, color: isSelected ? Colors.white : Tokens.pink), const SizedBox(width: 6)],
          Text(tag.label),
        ],
      ),
      selected: isSelected,
      onSelected: (_) => _toggle(tag.id),
      selectedColor: Tokens.pink,
      checkmarkColor: Colors.white,
      labelStyle: TextStyle(
        color: isSelected ? Colors.white : Tokens.pinkDeep,
        fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
        fontSize: 13,
      ),
      backgroundColor: Tokens.tanCard,
      side: BorderSide(color: isSelected ? Tokens.pink : Tokens.pink.withValues(alpha: 0.3)),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Tokens.radiusPill)),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
      visualDensity: VisualDensity.compact,
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