import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../searchable_single_select.dart';
import '../../core/theme.dart';

/// Ethnicity selection screen - Step 4
class EthnicityScreen extends ConsumerStatefulWidget {
  const EthnicityScreen({
    super.key,
    required this.onConfirm,
    required this.currentStep,
    required this.totalSteps,
  });

  final void Function(dynamic selected) onConfirm;
  final int currentStep;
  final int totalSteps;

  @override
  ConsumerState<EthnicityScreen> createState() => _EthnicityScreenState();
}

class _EthnicityScreenState extends ConsumerState<EthnicityScreen> {
  @override
  Widget build(BuildContext context) => SearchableSingleSelectScreen(
        title: 'What\'s your ethnicity?',
        apiPath: '/ethnicities',
        suggestedApiPath: '/ethnicities/suggested',
        onConfirm: onConfirm,
        currentStep: currentStep,
        totalSteps: totalSteps,
        helpText: 'Your ethnicity helps with cultural compatibility matching.',
        itemLabel: (item) => item['label'] ?? item['name'] ?? item.toString(),
        itemIcon: null, // No flags for ethnicity as per spec
      );
}