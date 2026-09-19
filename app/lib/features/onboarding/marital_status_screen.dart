import 'package:flutter/material.dart';

import 'simple_auto_advance.dart';

/// Marital status selection screen - Step 5
class MaritalStatusScreen extends StatelessWidget {
  const MaritalStatusScreen({
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
        title: 'What\'s your marital status?',
        options: const [
          'Never married',
          'Divorced',
          'Separated',
          'Annulled',
          'Widowed',
          'Married'
        ],
        onSelect: onSelect,
        currentStep: currentStep,
        totalSteps: totalSteps,
        helpText: 'Your marital status is important for matchmaking.',
      );
}