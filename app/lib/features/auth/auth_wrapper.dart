import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/core.dart';
import '../../main.dart';

/// Auth wrapper that routes to the appropriate screen based on auth state.
/// - Unauthenticated: LoginScreen
/// - Authenticated + profile incomplete: OnboardingFlow
/// - Authenticated + profile complete: HomeShell
class AuthWrapper extends ConsumerWidget {
  const AuthWrapper({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final authState = ref.watch(authProvider);

    return switch (authState.status) {
      AuthStatus.initial => const _LoadingScreen(),
      AuthStatus.unauthenticated => const LoginScreen(),
      AuthStatus.authenticating => const _LoadingScreen(),
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