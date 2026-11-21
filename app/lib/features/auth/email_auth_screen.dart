import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/core.dart';

/// Email sign-in / sign-up form. One toggle — a forgot-password flow is not
/// built yet; password reset happens through the backend admin for now.
class EmailAuthScreen extends ConsumerStatefulWidget {
  const EmailAuthScreen({super.key});

  @override
  ConsumerState<EmailAuthScreen> createState() => _EmailAuthScreenState();
}

class _EmailAuthScreenState extends ConsumerState<EmailAuthScreen> {
  final _formKey = GlobalKey<FormState>();
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _isSignUp = false;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _error = null;
    });

    final auth = ref.read(authProvider.notifier);
    try {
      if (_isSignUp) {
        await auth.signUpWithEmail(_email.text.trim(), _password.text);
      } else {
        await auth.signInWithEmail(_email.text.trim(), _password.text);
      }
      // Navigation handled by AuthWrapper on auth-state change.
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = e.toString().replaceFirst('Exception: ', '');
          _busy = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Tokens.tanBase,
      appBar: AppBar(title: Text(_isSignUp ? 'Create account' : 'Sign in')),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(Tokens.spaceLg),
          children: [
            TextFormField(
              controller: _email,
              decoration: const InputDecoration(labelText: 'Email'),
              keyboardType: TextInputType.emailAddress,
              autofillHints: const [AutofillHints.email],
              validator: (v) =>
                  v != null && v.contains('@') && v.contains('.') ? null : 'Enter a valid email',
            ),
            const SizedBox(height: Tokens.spaceMd),
            TextFormField(
              controller: _password,
              decoration: const InputDecoration(labelText: 'Password'),
              obscureText: true,
              autofillHints: const [AutofillHints.password],
              validator: (v) => v != null && v.length >= 6 ? null : 'Min 6 characters',
            ),
            const SizedBox(height: Tokens.spaceLg),
            FilledButton(
              onPressed: _busy ? null : _submit,
              style: FilledButton.styleFrom(
                minimumSize: const Size.fromHeight(52),
                backgroundColor: Tokens.pink,
              ),
              child: Text(_busy
                  ? 'Please wait…'
                  : _isSignUp
                      ? 'Create account'
                      : 'Sign in'),
            ),
            const SizedBox(height: Tokens.spaceMd),
            if (_error != null)
              Text(_error!, style: TextStyle(color: Colors.red.shade700), textAlign: TextAlign.center),
            const SizedBox(height: Tokens.spaceMd),
            TextButton(
              onPressed: _busy
                  ? null
                  : () => setState(() {
                        _isSignUp = !_isSignUp;
                        _error = null;
                      }),
              child: Text(_isSignUp
                  ? 'Already have an account? Sign in'
                  : 'New here? Create an account'),
            ),
          ],
        ),
      ),
    );
  }
}
