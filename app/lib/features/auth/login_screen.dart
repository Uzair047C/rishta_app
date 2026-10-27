import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/core.dart';

/// Login screen with Google Sign-In button.
/// Matches the app's design language using Material 3 tokens.
class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  bool _isSigningIn = false;
  String? _error;

  @override
  Widget build(BuildContext context) {
    final screenType = Breakpoints.of(context);
    final isWide = screenType.isDesktop || screenType.isTablet;

    return Scaffold(
      backgroundColor: Tokens.tanBase,
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: BoxConstraints(
              maxWidth: isWide ? 400 : double.infinity,
            ),
            child: Padding(
              padding: EdgeInsets.all(isWide ? Tokens.spaceXl : Tokens.spaceLg),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // Logo / App name
                  Column(
                    children: [
                      Container(
                        width: 80,
                        height: 80,
                        decoration: BoxDecoration(
                          color: Tokens.pink,
                          borderRadius: BorderRadius.circular(Tokens.radiusLg),
                        ),
                        child: const Icon(
                          Icons.favorite_rounded,
                          size: 40,
                          color: Colors.white,
                        ),
                      ),
                      const SizedBox(height: Tokens.spaceLg),
                      Text(
                        'Rishta',
                        style: Theme.of(context).textTheme.displaySmall?.copyWith(
                              color: Tokens.pinkDeep,
                              fontWeight: FontWeight.w800,
                            ),
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: Tokens.spaceSm),
                      Text(
                        'Find your match',
                        style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                              color: Colors.brown.shade600,
                            ),
                        textAlign: TextAlign.center,
                      ),
                    ],
                  ),

                  const SizedBox(height: Tokens.spaceXl * 2),

                  // Google Sign-In button
                  FilledButton.icon(
                    onPressed: _isSigningIn ? null : _handleGoogleSignIn,
                    icon: _isSigningIn
                        ? const SizedBox.square(
                            dimension: 20,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              valueColor: AlwaysStoppedAnimation(Colors.white),
                            ),
                          )
                        : Image.asset(
                            'assets/google_logo.png',
                            width: 20,
                            height: 20,
                            errorBuilder: (_, __, ___) => const _GoogleIconFallback(),
                          ),
                    label: Text(
                      _isSigningIn ? 'Signing in…' : 'Continue with Google',
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    style: FilledButton.styleFrom(
                      minimumSize: const Size.fromHeight(52),
                      backgroundColor: Colors.white,
                      foregroundColor: Colors.black87,
                      side: BorderSide(color: Colors.grey.shade300, width: 1.5),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(Tokens.radiusMd),
                      ),
                      elevation: 0,
                    ),
                  ),

                  const SizedBox(height: Tokens.spaceMd),

                  // Error message
                  if (_error != null)
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: Tokens.spaceMd),
                      child: Text(
                        _error!,
                        style: TextStyle(
                          color: Colors.red.shade700,
                          fontSize: 13,
                        ),
                        textAlign: TextAlign.center,
                      ),
                    ),

                  const SizedBox(height: Tokens.spaceLg),

                  // Terms & Privacy
                  Text(
                    'By continuing, you agree to our Terms of Service and Privacy Policy.',
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: Colors.brown.shade500,
                        ),
                    textAlign: TextAlign.center,
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _handleGoogleSignIn() async {
    setState(() {
      _isSigningIn = true;
      _error = null;
    });

    try {
      await ref.read(authProvider.notifier).signInWithGoogle();
      // Navigation is handled by AuthWrapper listening to auth state
    } on Exception catch (e) {
      if (mounted) {
        setState(() {
          _error = e.toString().replaceFirst('Exception: ', '');
          _isSigningIn = false;
        });
      }
    }
  }
}

class _GoogleIconFallback extends StatelessWidget {
  const _GoogleIconFallback();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 20,
      height: 20,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: const LinearGradient(
          colors: [Color(0xFF4285F4), Color(0xFF34A853), Color(0xFFFBBC05), Color(0xFFEA4335)],
          stops: [0.0, 0.25, 0.5, 0.75],
        ),
      ),
      child: const Center(
        child: Text(
          'G',
          style: TextStyle(
            color: Colors.white,
            fontWeight: FontWeight.w700,
            fontSize: 12,
          ),
        ),
      ),
    );
  }
}