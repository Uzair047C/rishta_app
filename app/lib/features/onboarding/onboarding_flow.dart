import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth_providers.dart';
import '../../core/providers.dart';
import 'alcohol_screen.dart';
import 'bio_screen.dart';
import 'ethnicity_screen.dart';
import 'interests_screen.dart';
import 'marital_status_screen.dart';
import 'marriage_intentions_screen.dart';
import 'move_abroad_screen.dart';
import 'nationality_screen.dart';
import 'personality_screen.dart';
import 'photo_guidelines_screen.dart';
import 'photos_screen.dart';
import 'profession_screen.dart';
import 'religious_practice_screen.dart';
import 'sect_screen.dart';
import 'selfie_screen.dart';

/// Onboarding flow that guides new users through profile creation.
/// Steps are defined in order and each step completes by calling the appropriate callback.
class OnboardingFlow extends ConsumerStatefulWidget {
  const OnboardingFlow({super.key});

  @override
  ConsumerState<OnboardingFlow> createState() => _OnboardingFlowState();
}

class _OnboardingFlowState extends ConsumerState<OnboardingFlow> {
  int _currentStep = 0;

  // Define the onboarding steps in order (matching the spec's 21 screens)
  late final List<OnboardingStep> _steps = [
    OnboardingStep(
      title: 'Photo Guidelines',
      build: (context, onNext) => PhotoGuidelinesScreen(
        onContinue: onNext,
        currentStep: _currentStep + 1,
        totalSteps: _steps.length,
      ),
    ),
    OnboardingStep(
      title: 'Photos',
      build: (context, onNext) => PhotosScreen(
        onNext: onNext,
        currentStep: _currentStep + 1,
        totalSteps: _steps.length,
      ),
    ),
    OnboardingStep(
      title: 'Selfie Verification',
      build: (context, onNext) => SelfieScreen(
        onDone: onNext,
        currentStep: _currentStep + 1,
        totalSteps: _steps.length,
      ),
    ),
    OnboardingStep(
      title: 'Profession',
      build: (context, onNext) => ProfessionScreen(
        onConfirm: (profession) async {
          await ref.read(myProfileProvider.notifier).save({'profession': profession});
          onNext();
        },
        currentStep: _currentStep + 1,
        totalSteps: _steps.length,
      ),
    ),
    OnboardingStep(
      title: 'Nationality',
      build: (context, onNext) => NationalityScreen(
        onConfirm: (nationality) async {
          await ref.read(myProfileProvider.notifier).save({'nationality': nationality});
          onNext();
        },
        currentStep: _currentStep + 1,
        totalSteps: _steps.length,
      ),
    ),
    OnboardingStep(
      title: 'Ethnicity',
      build: (context, onNext) => EthnicityScreen(
        onConfirm: (ethnicity) async {
          await ref.read(myProfileProvider.notifier).save({'ethnicity': ethnicity});
          onNext();
        },
        currentStep: _currentStep + 1,
        totalSteps: _steps.length,
      ),
    ),
    OnboardingStep(
      title: 'Religious Practice',
      build: (context, onNext) => ReligiousPracticeScreen(
        onSelect: (practice) async {
          await ref.read(myProfileProvider.notifier).save({'religious_practice_level': practice});
          onNext();
        },
        currentStep: _currentStep + 1,
        totalSteps: _steps.length,
      ),
    ),
    OnboardingStep(
      title: 'Sect',
      build: (context, onNext) => SectScreen(
        onSelect: (sect) async {
          await ref.read(myProfileProvider.notifier).save({'sect': sect});
          onNext();
        },
        currentStep: _currentStep + 1,
        totalSteps: _steps.length,
      ),
    ),
    OnboardingStep(
      title: 'Marital Status',
      build: (context, onNext) => MaritalStatusScreen(
        onSelect: (status) async {
          await ref.read(myProfileProvider.notifier).save({'marital_status': status});
          onNext();
        },
        currentStep: _currentStep + 1,
        totalSteps: _steps.length,
      ),
    ),
    OnboardingStep(
      title: 'Marriage Intentions',
      build: (context, onNext) => MarriageIntentionsScreen(
        onContinue: (groupA, groupB) async {
          await ref.read(myProfileProvider.notifier).save({
            'relationship_timeline_intent': groupA,
            'marriage_timeline_intent': groupB,
          });
          onNext();
        },
        currentStep: _currentStep + 1,
        totalSteps: _steps.length,
      ),
    ),
    OnboardingStep(
      title: 'Interests',
      build: (context, onNext) => InterestsScreen(
        onConfirm: (interests) async {
          await ref.read(myProfileProvider.notifier).save({'interests': interests.toList()});
          onNext();
        },
        currentStep: _currentStep + 1,
        totalSteps: _steps.length,
      ),
    ),
    OnboardingStep(
      title: 'Personality',
      build: (context, onNext) => PersonalityScreen(
        onConfirm: (traits) async {
          await ref.read(myProfileProvider.notifier).save({'personality_traits': traits.toList()});
          onNext();
        },
        currentStep: _currentStep + 1,
        totalSteps: _steps.length,
      ),
    ),
    OnboardingStep(
      title: 'Alcohol',
      build: (context, onNext) => AlcoholScreen(
        onSelect: (drinks) async {
          await ref.read(myProfileProvider.notifier).save({'drinks_alcohol': drinks == 'Yes'});
          onNext();
        },
        currentStep: _currentStep + 1,
        totalSteps: _steps.length,
      ),
    ),
    OnboardingStep(
      title: 'Move Abroad',
      build: (context, onNext) => MoveAbroadScreen(
        onSelect: (wouldMove) async {
          await ref.read(myProfileProvider.notifier).save({'would_move_abroad': wouldMove == 'Yes'});
          onNext();
        },
        currentStep: _currentStep + 1,
        totalSteps: _steps.length,
      ),
    ),
    OnboardingStep(
      title: 'Bio',
      build: (context, onNext) => BioScreen(
        onSubmit: (bio) async {
          await ref.read(myProfileProvider.notifier).save({'bio': bio});
          onNext();
        },
        currentStep: _currentStep + 1,
        totalSteps: _steps.length,
      ),
    ),
  ];

  void _nextStep() {
    if (_currentStep < _steps.length - 1) {
      setState(() => _currentStep++);
    } else {
      _completeOnboarding();
    }
  }

  Future<void> _completeOnboarding() async {
    // Mark profile as complete in auth state
    ref.read(authProvider.notifier).setProfileComplete();
    // Navigation to HomeShell is handled by AuthWrapper
  }

  @override
  Widget build(BuildContext context) {
    final step = _steps[_currentStep];
    return step.build(context, _nextStep);
  }
}

/// Represents a single step in the onboarding flow.
class OnboardingStep {
  const OnboardingStep({
    required this.title,
    required this.build,
  });

  final String title;
  final Widget Function(BuildContext context, VoidCallback onNext) build;
}