import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/core.dart';

/// Phone OTP sign-in: enter number -> Firebase sends SMS -> enter code.
/// Firebase handles delivery/re-send limits; the backend sees only the
/// resulting ID token via /auth/firebase.
class PhoneAuthScreen extends ConsumerStatefulWidget {
  const PhoneAuthScreen({super.key});

  @override
  ConsumerState<PhoneAuthScreen> createState() => _PhoneAuthScreenState();
}

class _PhoneAuthScreenState extends ConsumerState<PhoneAuthScreen> {
  final _phone = TextEditingController();
  final _code = TextEditingController();
  bool _codeSent = false;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _phone.dispose();
    _code.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    if (_phone.text.trim().length < 7) {
      setState(() => _error = 'Enter a valid phone number with country code.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(authProvider.notifier).sendPhoneOtp(_phone.text.trim());
      if (mounted) {
        setState(() {
          _codeSent = true;
          _busy = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _verify() async {
    if (_code.text.trim().length < 6) {
      setState(() => _error = 'Enter the 6-digit code.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(authProvider.notifier).verifyPhoneOtp(_code.text.trim());
      // Navigation handled by AuthWrapper on auth-state change.
    } catch (_) {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    // Watch auth so auto-resolution (verificationCompleted) navigates away.
    ref.watch(authProvider);
    return Scaffold(
      backgroundColor: Tokens.tanBase,
      appBar: AppBar(title: const Text('Sign in with phone')),
      body: ListView(
        padding: const EdgeInsets.all(Tokens.spaceLg),
        children: [
          if (!_codeSent) ...[
            TextField(
              controller: _phone,
              keyboardType: TextInputType.phone,
              autofillHints: const [AutofillHints.telephoneNumber],
              decoration: const InputDecoration(
                labelText: 'Phone number',
                hintText: '+1 555 000 1234',
              ),
            ),
            const SizedBox(height: Tokens.spaceLg),
            FilledButton(
              onPressed: _busy ? null : _send,
              style: FilledButton.styleFrom(
                minimumSize: const Size.fromHeight(52),
                backgroundColor: Tokens.pink,
              ),
              child: Text(_busy ? 'Sending…' : 'Send code'),
            ),
          ] else ...[
            TextField(
              controller: _code,
              keyboardType: TextInputType.number,
              maxLength: 6,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 24, letterSpacing: 8),
              decoration: const InputDecoration(
                labelText: 'Verification code',
                counterText: '',
              ),
            ),
            const SizedBox(height: Tokens.spaceLg),
            FilledButton(
              onPressed: _busy ? null : _verify,
              style: FilledButton.styleFrom(
                minimumSize: const Size.fromHeight(52),
                backgroundColor: Tokens.pink,
              ),
              child: Text(_busy ? 'Verifying…' : 'Verify'),
            ),
            const SizedBox(height: Tokens.spaceMd),
            TextButton(
              onPressed: _busy ? null : () => setState(() => _codeSent = false),
              child: const Text('Wrong number? Edit it'),
            ),
          ],
          const SizedBox(height: Tokens.spaceMd),
          if (_error != null)
            Text(_error!, style: TextStyle(color: Colors.red.shade700), textAlign: TextAlign.center),
        ],
      ),
    );
  }
}
