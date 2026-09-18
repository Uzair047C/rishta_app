import 'package:flutter/material.dart';

import '../simple_auto_advance.dart';
import '../../core/theme.dart';

/// Sect selection screen - Step 1
class SectScreen extends StatelessWidget {
  const SectScreen({
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
        title: 'What sect do you belong to?',
        options: const ['Sunni', 'Shia', 'Other', 'Prefer not to say'],
        onSelect: onSelect,
        currentStep: currentStep,
        totalSteps: totalSteps,
        helpText: 'This helps us understand your background better.',
      );
}