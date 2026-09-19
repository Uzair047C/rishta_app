import 'package:flutter/material.dart';

import 'simple_auto_advance.dart';

/// Move abroad for marriage screen - Step 9
class MoveAbroadScreen extends StatelessWidget {
  const MoveAbroadScreen({
    super.key,
    required this.onSelect,
    required this.currentStep,
    required this.totalSteps,
  });

  final void Function(String selected) onSelect;
  final int currentStep;
  final int totalSteps;

  @override
  Widget build(BuildContext context) => SimpleAutoAdvanceScreen(
        title: 'Would you move abroad for marriage?',
        options: const ['Yes', 'No'],
        onSelect: onSelect,
        currentStep: currentStep,
        totalSteps: totalSteps,
        helpText: 'This helps with location-based compatibility matching.',
      );
}