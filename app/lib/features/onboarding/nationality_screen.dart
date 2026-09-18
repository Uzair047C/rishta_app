import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../searchable_single_select.dart';
import '../../core/theme.dart';

/// Nationality selection screen - Step 3
class NationalityScreen extends ConsumerStatefulWidget {
  const NationalityScreen({
    super.key,
    required this.onConfirm,
    required this.currentStep,
    required this.totalSteps,
  });

  final void Function(dynamic selected) onConfirm;
  final int currentStep;
  final int totalSteps;

  @override
  ConsumerState<NationalityScreen> createState() => _NationalityScreenState();
}

class _NationalityScreenState extends ConsumerState<NationalityScreen> {
  @override
  Widget build(BuildContext context) => SearchableSingleSelectScreen(
        title: 'What\'s your nationality?',
        apiPath: '/nationalities',
        suggestedApiPath: '/nationalities/suggested',
        onConfirm: onConfirm,
        currentStep: currentStep,
        totalSteps: totalSteps,
        helpText: 'Your nationality helps with location-based matching.',
        itemLabel: (item) => item['label'] ?? item['name'] ?? item.toString(),
        itemIcon: (item) => item['icon'] != null
            ? IconData(item['icon'] as int, fontFamily: 'MaterialIcons')
            : null,
      );
}