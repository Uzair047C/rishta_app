import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/auth.dart';

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
    return Scaffold(
      backgroundColor: const Color(0xFFF5F0E8), // tan base
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 400),
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // Logo
                  Column(
                    children: [
                      Container(
                        width: 80,
                        height: 80,
                        decoration: BoxDecoration(
                          color: const Color(0xFFE8557A), // pink
                          borderRadius: BorderRadius.circular(16),
                        ),
                        child: const Icon(Icons.favorite_rounded, size: 40, color: Colors.white),
                      ),
                      const SizedBox(height: 16),
                      const Text(
                        'Rishta',
                        style: TextStyle(
                          fontSize: 36,
                          fontWeight: FontWeight.w800,
                          color: Color(0xFF8B2E4A), // pink deep
                        ),
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: 8),
                      Text(
                        'Find your match',
                        style: TextStyle(fontSize: 16, color: Colors.brown.shade600),
                        textAlign: TextAlign.center,
                      ),
                    ],
                  ),

                  const SizedBox(height: 48),

                  // Google Sign-In button
                  FilledButton.icon(
                    onPressed: _isSigningIn ? null : _handleGoogleSignIn,
                    icon: _isSigningIn
                        ? const SizedBox.square(
                            dimension: 20,
                            child: CircularProgressIndicator(strokeWidth: 2, valueColor: AlwaysStoppedAnimation(Colors.white)),
                          )
                        : const _GoogleIcon(),
                    label: Text(
                      _isSigningIn ? 'Signing in…' : 'Continue with Google',
                      style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
                    ),
                    style: FilledButton.styleFrom(
                      minimumSize: const Size.fromHeight(52),
                      backgroundColor: Colors.white,
                      foregroundColor: Colors.black87,
                      side: BorderSide(color: Colors.grey.shade300, width: 1.5),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      elevation: 0,
                    ),
                  ),

                  const SizedBox(height: 16),

                  // Error message
                  if (_error != null)
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      child: Text(
                        _error!,
                        style: TextStyle(color: Colors.red.shade700, fontSize: 13),
                        textAlign: TextAlign.center,
                      ),
                    ),

                  const SizedBox(height: 24),

                  // Terms & Privacy
                  Text(
                    'By continuing, you agree to our Terms of Service and Privacy Policy.',
                    style: TextStyle(fontSize: 12, color: Colors.brown.shade500),
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
      // Navigation handled by AuthWrapper
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

class _GoogleIcon extends StatelessWidget {
  const _GoogleIcon();

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
        child: Text('G', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 12)),
      ),
    );
  }
}