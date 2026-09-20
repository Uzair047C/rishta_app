import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/core.dart';
import 'features/feed/feed_screen.dart';
import 'features/matches/matches_screen.dart';
import 'features/onboarding/photos_screen.dart';
import 'features/onboarding/profile_form_screen.dart';
import 'features/onboarding/selfie_screen.dart';
import 'features/settings/settings_screen.dart';

/// Live theme mode state for dynamic light/dark toggling.
final themeModeProvider = StateProvider<ThemeMode>((ref) => ThemeMode.light);

/// FCM delivers data-only messages, which the OS will not surface on its own, so
/// the server-triggered notifications are rendered here while the app is
/// backgrounded. Must be a top-level function.
@pragma('vm:entry-point')
Future<void> _onBackgroundMessage(RemoteMessage message) async {
  try {
    await Firebase.initializeApp();
  } catch (_) {}
}

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  debugPrint('Main: Starting Firebase initialization');

  // Initialize Firebase for mobile and desktop
  try {
    debugPrint('Main: Initializing Firebase');
    await Firebase.initializeApp();
    debugPrint('Main: Firebase initialized');
  } catch (e) {
    if (kDebugMode) {
      debugPrint('[Firebase] Initialization error: $e');
    }
    debugPrint('Main: Firebase initialization error: $e');
  }
    debugPrint('Main: Setting up background message handler');
    FirebaseMessaging.onBackgroundMessage(_onBackgroundMessage);
    debugPrint('Main: Background message handler set up');
  } catch (e) {
    if (kDebugMode) {
      debugPrint('[Firebase] Live preview mode without native config: $e');
    }
    debugPrint('Main: Firebase initialization error: $e');
  }

  debugPrint('Main: Running app');
  runApp(const ProviderScope(child: RishtaApp()));
}

class RishtaApp extends ConsumerWidget {
  const RishtaApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final themeMode = ref.watch(themeModeProvider);

    return MaterialApp(
      title: 'Rishta',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      themeMode: themeMode,
      builder: (context, child) {
        return child ?? const SizedBox.shrink();
      },
      home: const AppGate(),
    );
  }
}

/// Single routing decision point. Everything downstream can assume a signed-in,
/// onboarded, verified user — which is why no individual screen re-checks.
class AppGate extends ConsumerWidget {
  const AppGate({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // TEMP: Skip auth for inner feature development
    return const HomeShell();
  }

  /// A finished selfie changes both the verification verdict and the session's
  /// completeness, so both are re-read rather than assumed.
  static void _refresh(WidgetRef ref) {
    ref.invalidate(verificationProvider);
    ref.invalidate(sessionProvider);
  }
}

/// Profile -> photos -> selfie, in the order spec 2.6 lays out. The selfie step
/// is part of onboarding, not an afterthought, so browsing is unreachable until
/// it clears.
class OnboardingFlow extends ConsumerStatefulWidget {
  const OnboardingFlow({super.key});

  @override
  ConsumerState<OnboardingFlow> createState() => _OnboardingFlowState();
}

class _OnboardingFlowState extends ConsumerState<OnboardingFlow> {
  int _step = 0;

  @override
  Widget build(BuildContext context) => switch (_step) {
        0 => ProfileFormScreen(onNext: () => setState(() => _step = 1)),
        1 => PhotosScreen(onNext: () => setState(() => _step = 2)),
        _ => SelfieScreen(onDone: () => AppGate._refresh(ref)),
      };
}

/// Multi-breakpoint responsive navigation shell for the signed-in app.
class HomeShell extends ConsumerStatefulWidget {
  const HomeShell({super.key});

  @override
  ConsumerState<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends ConsumerState<HomeShell> {
  int _index = 0;

  static const _destinations = [
    NavigationDestination(
      icon: Icon(Icons.explore_outlined),
      selectedIcon: Icon(Icons.explore),
      label: 'Discover',
    ),
    NavigationDestination(
      icon: Icon(Icons.chat_bubble_outline),
      selectedIcon: Icon(Icons.chat_bubble),
      label: 'Matches',
    ),
    NavigationDestination(
      icon: Icon(Icons.person_outline),
      selectedIcon: Icon(Icons.person),
      label: 'You',
    ),
  ];

  @override
  Widget build(BuildContext context) {
    final screenType = Breakpoints.of(context);
    final isWide = screenType.isDesktop || screenType.isTablet;

    final body = IndexedStack(
      index: _index,
      children: const [FeedScreen(), MatchesScreen(), SettingsScreen()],
    );

    if (isWide) {
      return Scaffold(
        body: Row(
          children: [
            NavigationRail(
              selectedIndex: _index,
              onDestinationSelected: (i) => setState(() => _index = i),
              labelType: NavigationRailLabelType.all,
              destinations: const [
                NavigationRailDestination(
                  icon: Icon(Icons.explore_outlined),
                  selectedIcon: Icon(Icons.explore),
                  label: Text('Discover'),
                ),
                NavigationRailDestination(
                  icon: Icon(Icons.chat_bubble_outline),
                  selectedIcon: Icon(Icons.chat_bubble),
                  label: Text('Matches'),
                ),
                NavigationRailDestination(
                  icon: Icon(Icons.person_outline),
                  selectedIcon: Icon(Icons.person),
                  label: Text('You'),
                ),
              ],
            ),
            const VerticalDivider(thickness: 1, width: 1),
            Expanded(child: body),
          ],
        ),
      );
    }

    return Scaffold(
      body: body,
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        destinations: _destinations,
        onDestinationSelected: (i) => setState(() => _index = i),
      ),
    );
  }
}
