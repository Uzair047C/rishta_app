import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'tag_grid_screen.dart';
import '../../core/providers.dart';

/// Personality traits selection screen - Step 11
class PersonalityScreen extends ConsumerStatefulWidget {
  const PersonalityScreen({
    super.key,
    required this.onConfirm,
    required this.currentStep,
    required this.totalSteps,
  });

  final void Function(Set<dynamic> selected) onConfirm;
  final int currentStep;
  final int totalSteps;

  @override
  ConsumerState<PersonalityScreen> createState() => _PersonalityScreenState();
}

class _PersonalityScreenState extends ConsumerState<PersonalityScreen> {
  @override
  Widget build(BuildContext context) {
    final categories = ref.watch(personalityCategoriesProvider);

    return TagGridScreen(
      title: 'How would you describe your personality?',
      categories: categories.when(
        data: (data) => data,
        loading: () => const [],
        error: (_, __) => const [],
      ),
      onConfirm: widget.onConfirm,
      currentStep: widget.currentStep,
      totalSteps: widget.totalSteps,
      helpText: 'Select up to 5 traits that best describe your personality.',
      isSkippable: true,
      onSkip: () => widget.onConfirm(const {}),
      maxSelectable: 5, // Maximum 5 traits for personality as per spec
    );
  }
}