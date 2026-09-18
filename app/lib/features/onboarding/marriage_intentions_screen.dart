import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../dual_group_screen.dart';
import '../../core/theme.dart';

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
        groupA: _GroupConfig(
          title: 'I\'d like to know someone on Muzz for:',
          options: const [
            GroupOption(id: '1-2_months', label: '1-2 months'),
            GroupOption(id: '3-4_months', label: '3-4 months'),
            GroupOption(id: '4-12_months', label: '4-12 months'),
            GroupOption(id: '1-2_years', label: '1-2 years'),
          ],
        ),
        groupB: _GroupConfig(
          title: 'I\'d like to be married within:',
          options: const [
            GroupOption(id: '1-2_months', label: '1-2 months'),
            GroupOption(id: '3-4_months', label: '3-4 months'),
            GroupOption(id: '4-12_months', label: '4-12 months'),
            GroupOption(id: '1-2_years', label: '1-2 years'),
            GroupOption(id: '3-4_years', label: '3-4 years'),
            GroupOption(id: '4_plus_years', label: '4+ years'),
            GroupOption(id: 'ages_together', label: 'Ages together'),
          ],
        ),
        onContinue: onContinue,
        currentStep: currentStep,
        totalSteps: totalSteps,
        helpText: 'These timelines help us understand your relationship goals.',
      );
}

class _GroupConfig {
  const _GroupConfig({
    required this.title,
    required this.options,
    this.initialValue,
  });

  final String title;
  final List<GroupOption> options;
  final dynamic initialValue;
}

class GroupOption {
  const GroupOption({
    required this.id,
    required this.label,
    this.icon,
  });

  final dynamic id;
  final String label;
  final IconData? icon;
}