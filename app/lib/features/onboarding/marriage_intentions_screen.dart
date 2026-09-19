import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'dual_group_screen.dart';

/// Marriage intentions screen - Step 6
class MarriageIntentionsScreen extends ConsumerStatefulWidget {
  const MarriageIntentionsScreen({
    super.key,
    required this.onContinue,
    required this.currentStep,
    required this.totalSteps,
  });

  final void Function(dynamic groupAValue, dynamic groupBValue) onContinue;
  final int currentStep;
  final int totalSteps;

  @override
  ConsumerState<MarriageIntentionsScreen> createState() =>
      _MarriageIntentionsScreenState();
}

class _MarriageIntentionsScreenState
    extends ConsumerState<MarriageIntentionsScreen> {
  @override
  Widget build(BuildContext context) => DualGroupScreen(
        title: 'What are your intentions for marriage?',
        groupA: GroupConfig(
          title: 'I\'d like to know someone on Muzz for:',
          options: [
            GroupOption(id: '1-2_months', label: '1-2 months'),
            GroupOption(id: '3-4_months', label: '3-4 months'),
            GroupOption(id: '4-12_months', label: '4-12 months'),
            GroupOption(id: '1-2_years', label: '1-2 years'),
          ],
        ),
        groupB: GroupConfig(
          title: 'I\'d like to be married within:',
          options: [
            GroupOption(id: '1-2_months', label: '1-2 months'),
            GroupOption(id: '3-4_months', label: '3-4 months'),
            GroupOption(id: '4-12_months', label: '4-12 months'),
            GroupOption(id: '1-2_years', label: '1-2 years'),
            GroupOption(id: '3-4_years', label: '3-4 years'),
            GroupOption(id: '4_plus_years', label: '4+ years'),
            GroupOption(id: 'ages_together', label: 'Ages together'),
          ],
        ),
        onContinue: widget.onContinue,
        currentStep: widget.currentStep,
        totalSteps: widget.totalSteps,
        helpText: 'These timelines help us understand your relationship goals.',
      );
}