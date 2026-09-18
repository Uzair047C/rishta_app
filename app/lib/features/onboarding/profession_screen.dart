import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../searchable_single_select.dart';
import '../../core/theme.dart';

/// Profession selection screen - Step 2
class ProfessionScreen extends ConsumerStatefulWidget {
  const ProfessionScreen({
    super.key,
    required this.onConfirm,
    required this.currentStep,
    required this.totalSteps,
  });

  final void Function(dynamic selected) onConfirm;
  final int currentStep;
  final int totalSteps;

  @override
  ConsumerState<ProfessionScreen> createState() => _ProfessionScreenState();
}

class _ProfessionScreenState extends ConsumerState<ProfessionScreen> {
  @override
  Widget build(BuildContext context) => SearchableSingleSelectScreen(
        title: 'What\'s your profession?',
        apiPath: '/professions',
        onConfirm: onConfirm,
        currentStep: currentStep,
        totalSteps: totalSteps,
        helpText: 'Your profession helps with compatibility matching.',
        itemLabel: (item) => item['label'] ?? item['name'] ?? item.toString(),
        itemIcon: (item) => null,
      );
}