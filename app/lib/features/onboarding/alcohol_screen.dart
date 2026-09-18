import 'package:flutter/material.dart';

import '../simple_auto_advance.dart';
import '../../core/theme.dart';

/// Alcohol consumption screen - Step 8
class AlcoholScreen extends StatelessWidget {
  const AlcoholScreen({
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
        title: 'Do you drink alcohol?',
        options: const ['Yes', 'No'],
        onSelect: onSelect,
        currentStep: currentStep,
        totalSteps: totalSteps,
        helpText: 'This helps with lifestyle compatibility matching.',
      );
}