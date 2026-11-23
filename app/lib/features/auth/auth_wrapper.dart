import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/core.dart';
import '../../core/push.dart';
import '../../main.dart';

/// Fires once per app run, the first time auth reaches AuthStatus.authenticated
/// (login, onboarding finish, or restored session): registers the FCM token
/// with the backend, which requires an authed user.
bool _pushRegistered = false;

Future<void> _registerPush(WidgetRef ref) async {
  try {
    final token = await registerPush();
    if (token == null) return;
    await ref.read(apiProvider).post(
          '/notifications/device',
          body: {'token': token, 'platform': pushPlatform()},
        );
  } catch (_) {
    debugPrint('push registration failed');
  }
}

/// Auth wrapper that routes to the appropriate screen based on auth state.
/// - Unauthenticated: LoginScreen
/// - Authenticated + profile incomplete: OnboardingFlow
/// - Authenticated + profile complete: HomeShell
class AuthWrapper extends ConsumerWidget {
  const AuthWrapper({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final authState = ref.watch(authProvider);

    ref.listen<AuthState>(authProvider, (prev, next) {
      if (next.status == AuthStatus.authenticated && !_pushRegistered) {
        _pushRegistered = true;
        _registerPush(ref);
        listenForTokenRefresh((token, platform) => ref
            .read(apiProvider)
            .post('/notifications/device', body: {'token': token, 'platform': platform}));
      }
    });

    return switch (authState.status) {
      AuthStatus.initial => const _LoadingScreen(),
      AuthStatus.unauthenticated => const LoginScreen(),
      // Stay on LoginScreen while signing in so the provider-driven error
      // banner and button spinner stay visible (a loader here would wipe them).
      AuthStatus.authenticating => const LoginScreen(),
      AuthStatus.onboarding => const OnboardingFlow(),
      AuthStatus.authenticated => const HomeShell(),
    };
  }
}

/// Loading screen shown during auth initialization.
class _LoadingScreen extends StatelessWidget {
  const _LoadingScreen();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Tokens.tanBase,
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const CircularProgressIndicator(
              valueColor: AlwaysStoppedAnimation(Tokens.pink),
              strokeWidth: 3,
            ),
            const SizedBox(height: Tokens.spaceLg),
            Text(
              'Loading…',
              style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                    color: Tokens.pinkDeep,
                  ),
            ),
          ],
        ),
      ),
    );
  }
}