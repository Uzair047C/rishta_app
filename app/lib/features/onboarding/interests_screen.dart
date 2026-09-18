import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../tag_grid_screen.dart';
import '../../core/theme.dart';

/// Interests selection screen - Step 10
class InterestsScreen extends ConsumerStatefulWidget {
  const InterestsScreen({
    super.key,
    required this.onConfirm,
    required this.currentStep,
    required this.totalSteps,
  });

  final void Function(Set<dynamic> selected) onConfirm;
  final int currentStep;
  final int totalSteps;

  @override
  ConsumerState<InterestsScreen> createState() => _InterestsScreenState();
}

class _InterestsScreenState extends ConsumerState<InterestsScreen> {
  @override
  Widget build(BuildContext context) {
    final categories = ref.watch(interestCategoriesProvider);

    return TagGridScreen(
      title: 'What are your interests / hobbies?',
      categories: categories.when(
        data: (data) => data,
        loading: () => const [],
        error: (_, __) => const [],
      ),
      onConfirm: onConfirm,
      currentStep: currentStep,
      totalSteps: totalSteps,
      helpText: 'Select interests that best describe you. These help with compatibility matching.',
      isSkippable: true,
      maxSelectable: null, // Unlimited for interests
    );
  }
}