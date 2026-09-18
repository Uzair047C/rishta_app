import 'package:flutter/material.dart';

import '../card_single_select.dart';
import '../../core/theme.dart';

/// Religious practice level screen - Step 7
class ReligiousPracticeScreen extends StatelessWidget {
  const ReligiousPracticeScreen({
    super.key,
    required this.onSelect,
    required this.currentStep,
    required this.totalSteps,
  });

  final void Function(dynamic selected) onSelect;
  final int currentStep;
  final int totalSteps;

  @override
  Widget build(BuildContext context) => CardSingleSelectScreen(
        title: 'How do you practise your religion?',
        options: const [
          CardOption(
            id: 'strictly_practising',
            title: 'Strictly practising',
            description:
                'I pray all the time, fast, and adhere strictly to Islamic tenets',
          ),
          CardOption(
            id: 'actively_practising',
            title: 'Actively practising',
            description:
                'I try and make religious practice part of my daily life where I can',
          ),
          CardOption(
            id: 'occasionally_practising',
            title: 'Occasionally practising',
            description: '…Ramadan/Eid and other special occasions',
          ),
          CardOption(
            id: 'not_practising',
            title: 'Not practising at all',
            description:
                '…culturally a Muslim but do not actively practise',
          ),
        ],
        onSelect: onSelect,
        currentStep: currentStep,
        totalSteps: totalSteps,
        helpText: 'Your religious practice level helps with compatibility matching.',
      );
}