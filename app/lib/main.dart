import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/core.dart';
import 'features/auth/auth_screen.dart';
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

  // Safely initialize Firebase with fallback for Desktop/Web live previews
  try {
    if (kIsWeb) {
      await Firebase.initializeApp(
        options: const FirebaseOptions(
            apiKey: "AIzaSyBysS0XXNnvts4KzFivHYQySfvbgEF297A",
  authDomain: "rishta-app-316aa.firebaseapp.com",
  projectId: "rishta-app-316aa",
  storageBucket: "rishta-app-316aa.firebasestorage.app",
  messagingSenderId: "550519095432",
  appId: "1:550519095432:web:c193899b59a9f10b7a5f3d",
  measurementId: "G-ZGDLPSL2P9"
        ),
      );
    } else {
      await Firebase.initializeApp();
    }
    FirebaseMessaging.onBackgroundMessage(_onBackgroundMessage);
  } catch (e) {
    if (kDebugMode) {
      debugPrint('[Firebase] Live preview mode without native config: $e');
    }
  }

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
        final isDark = themeMode == ThemeMode.dark ||
            (themeMode == ThemeMode.system &&
                MediaQuery.platformBrightnessOf(context) == Brightness.dark);

        return DevPreviewOverlay(
          isDarkMode: isDark,
          onToggleTheme: () {
            ref.read(themeModeProvider.notifier).state =
                isDark ? ThemeMode.light : ThemeMode.dark;
          },
          child: child ?? const SizedBox.shrink(),
        );
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
    final auth = ref.watch(authStateProvider);

    if (auth.valueOrNull == null) {
      return auth.isLoading ? const Scaffold(body: LoadingView()) : const AuthScreen();
    }

    final session = ref.watch(sessionProvider);
    return AsyncView(
      value: session,
      onRetry: () => ref.invalidate(sessionProvider),
      builder: (value) {
        if (!value.signedIn) return const AuthScreen();
        if (!value.profileComplete) return const OnboardingFlow();

        // Spec 1.2 — an unverified account gets the pending screen, never the feed.
        final verification = ref.watch(verificationProvider);
        return AsyncView(
          value: verification,
          onRetry: () => ref.invalidate(verificationProvider),
          builder: (status) => status.isVerified
              ? const HomeShell()
              : VerificationPendingScreen(
                  onRetry: () async {
                    await Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) => SelfieScreen(onDone: () => _refresh(ref)),
                      ),
                    );
                    _refresh(ref);
                  },
                ),
        );
      },
    );
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
