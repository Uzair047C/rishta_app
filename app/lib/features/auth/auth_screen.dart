import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_sign_in/google_sign_in.dart';

import '../../core/providers.dart';
import '../../core/theme.dart';

// ═══════════════════════════════════════════════════════════════════════════
// Brand colours — short binders over the shared design tokens.
// ═══════════════════════════════════════════════════════════════════════════
const _pink = Tokens.pinkAccent;
const _pinkDeep = Tokens.pinkDeep;
const _pinkLight = Tokens.pinkLight;
const _tanBase = Tokens.tanBase;
const _tanDark = Tokens.tanDark;
const _tanCard = Tokens.tanCard;

// ═══════════════════════════════════════════════════════════════════════════
// Country model + full dial-code list
// ═══════════════════════════════════════════════════════════════════════════
class _Country {
  const _Country({required this.name, required this.code, required this.dialCode, required this.flag});
  final String name;
  final String code;
  final String dialCode;
  final String flag;

  String get displayName => '$flag  $name ($dialCode)';
}

// 65 most common countries, sorted by name
const List<_Country> _countries = [
  _Country(name: 'Afghanistan', code: 'AF', dialCode: '+93', flag: '🇦🇫'),
  _Country(name: 'Algeria', code: 'DZ', dialCode: '+213', flag: '🇩🇿'),
  _Country(name: 'Australia', code: 'AU', dialCode: '+61', flag: '🇦🇺'),
  _Country(name: 'Austria', code: 'AT', dialCode: '+43', flag: '🇦🇹'),
  _Country(name: 'Bahrain', code: 'BH', dialCode: '+973', flag: '🇧🇭'),
  _Country(name: 'Bangladesh', code: 'BD', dialCode: '+880', flag: '🇧🇩'),
  _Country(name: 'Belgium', code: 'BE', dialCode: '+32', flag: '🇧🇪'),
  _Country(name: 'Brazil', code: 'BR', dialCode: '+55', flag: '🇧🇷'),
  _Country(name: 'Canada', code: 'CA', dialCode: '+1', flag: '🇨🇦'),
  _Country(name: 'China', code: 'CN', dialCode: '+86', flag: '🇨🇳'),
  _Country(name: 'Denmark', code: 'DK', dialCode: '+45', flag: '🇩🇰'),
  _Country(name: 'Egypt', code: 'EG', dialCode: '+20', flag: '🇪🇬'),
  _Country(name: 'Ethiopia', code: 'ET', dialCode: '+251', flag: '🇪🇹'),
  _Country(name: 'Finland', code: 'FI', dialCode: '+358', flag: '🇫🇮'),
  _Country(name: 'France', code: 'FR', dialCode: '+33', flag: '🇫🇷'),
  _Country(name: 'Germany', code: 'DE', dialCode: '+49', flag: '🇩🇪'),
  _Country(name: 'Ghana', code: 'GH', dialCode: '+233', flag: '🇬🇭'),
  _Country(name: 'Greece', code: 'GR', dialCode: '+30', flag: '🇬🇷'),
  _Country(name: 'Hong Kong', code: 'HK', dialCode: '+852', flag: '🇭🇰'),
  _Country(name: 'India', code: 'IN', dialCode: '+91', flag: '🇮🇳'),
  _Country(name: 'Indonesia', code: 'ID', dialCode: '+62', flag: '🇮🇩'),
  _Country(name: 'Iran', code: 'IR', dialCode: '+98', flag: '🇮🇷'),
  _Country(name: 'Iraq', code: 'IQ', dialCode: '+964', flag: '🇮🇶'),
  _Country(name: 'Ireland', code: 'IE', dialCode: '+353', flag: '🇮🇪'),
  _Country(name: 'Israel', code: 'IL', dialCode: '+972', flag: '🇮🇱'),
  _Country(name: 'Italy', code: 'IT', dialCode: '+39', flag: '🇮🇹'),
  _Country(name: 'Japan', code: 'JP', dialCode: '+81', flag: '🇯🇵'),
  _Country(name: 'Jordan', code: 'JO', dialCode: '+962', flag: '🇯🇴'),
  _Country(name: 'Kenya', code: 'KE', dialCode: '+254', flag: '🇰🇪'),
  _Country(name: 'Kuwait', code: 'KW', dialCode: '+965', flag: '🇰🇼'),
  _Country(name: 'Lebanon', code: 'LB', dialCode: '+961', flag: '🇱🇧'),
  _Country(name: 'Libya', code: 'LY', dialCode: '+218', flag: '🇱🇾'),
  _Country(name: 'Malaysia', code: 'MY', dialCode: '+60', flag: '🇲🇾'),
  _Country(name: 'Maldives', code: 'MV', dialCode: '+960', flag: '🇲🇻'),
  _Country(name: 'Mexico', code: 'MX', dialCode: '+52', flag: '🇲🇽'),
  _Country(name: 'Morocco', code: 'MA', dialCode: '+212', flag: '🇲🇦'),
  _Country(name: 'Netherlands', code: 'NL', dialCode: '+31', flag: '🇳🇱'),
  _Country(name: 'New Zealand', code: 'NZ', dialCode: '+64', flag: '🇳🇿'),
  _Country(name: 'Nigeria', code: 'NG', dialCode: '+234', flag: '🇳🇬'),
  _Country(name: 'Norway', code: 'NO', dialCode: '+47', flag: '🇳🇴'),
  _Country(name: 'Oman', code: 'OM', dialCode: '+968', flag: '🇴🇲'),
  _Country(name: 'Pakistan', code: 'PK', dialCode: '+92', flag: '🇵🇰'),
  _Country(name: 'Philippines', code: 'PH', dialCode: '+63', flag: '🇵🇭'),
  _Country(name: 'Poland', code: 'PL', dialCode: '+48', flag: '🇵🇱'),
  _Country(name: 'Portugal', code: 'PT', dialCode: '+351', flag: '🇵🇹'),
  _Country(name: 'Qatar', code: 'QA', dialCode: '+974', flag: '🇶🇦'),
  _Country(name: 'Romania', code: 'RO', dialCode: '+40', flag: '🇷🇴'),
  _Country(name: 'Russia', code: 'RU', dialCode: '+7', flag: '🇷🇺'),
  _Country(name: 'Saudi Arabia', code: 'SA', dialCode: '+966', flag: '🇸🇦'),
  _Country(name: 'Singapore', code: 'SG', dialCode: '+65', flag: '🇸🇬'),
  _Country(name: 'South Africa', code: 'ZA', dialCode: '+27', flag: '🇿🇦'),
  _Country(name: 'South Korea', code: 'KR', dialCode: '+82', flag: '🇰🇷'),
  _Country(name: 'Spain', code: 'ES', dialCode: '+34', flag: '🇪🇸'),
  _Country(name: 'Sri Lanka', code: 'LK', dialCode: '+94', flag: '🇱🇰'),
  _Country(name: 'Sudan', code: 'SD', dialCode: '+249', flag: '🇸🇩'),
  _Country(name: 'Sweden', code: 'SE', dialCode: '+46', flag: '🇸🇪'),
  _Country(name: 'Switzerland', code: 'CH', dialCode: '+41', flag: '🇨🇭'),
  _Country(name: 'Syria', code: 'SY', dialCode: '+963', flag: '🇸🇾'),
  _Country(name: 'Taiwan', code: 'TW', dialCode: '+886', flag: '🇹🇼'),
  _Country(name: 'Tanzania', code: 'TZ', dialCode: '+255', flag: '🇹🇿'),
  _Country(name: 'Thailand', code: 'TH', dialCode: '+66', flag: '🇹🇭'),
  _Country(name: 'Tunisia', code: 'TN', dialCode: '+216', flag: '🇹🇳'),
  _Country(name: 'Turkey', code: 'TR', dialCode: '+90', flag: '🇹🇷'),
  _Country(name: 'UAE', code: 'AE', dialCode: '+971', flag: '🇦🇪'),
  _Country(name: 'Uganda', code: 'UG', dialCode: '+256', flag: '🇺🇬'),
  _Country(name: 'UK', code: 'GB', dialCode: '+44', flag: '🇬🇧'),
  _Country(name: 'USA', code: 'US', dialCode: '+1', flag: '🇺🇸'),
  _Country(name: 'Yemen', code: 'YE', dialCode: '+967', flag: '🇾🇪'),
];

// Default to Pakistan
const _defaultCountry = _Country(name: 'Pakistan', code: 'PK', dialCode: '+92', flag: '🇵🇰');

// ═══════════════════════════════════════════════════════════════════════════
// Auth screen
// ═══════════════════════════════════════════════════════════════════════════
class AuthScreen extends ConsumerStatefulWidget {
  const AuthScreen({super.key});

  @override
  ConsumerState<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends ConsumerState<AuthScreen>
    with SingleTickerProviderStateMixin {
  late final _tabs = TabController(length: 2, vsync: this);

  // email/password
  final _emailCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();
  bool _showPw = false;

  // phone
  _Country _country = _defaultCountry;
  final _phoneCtrl = TextEditingController();
  final _otpCtrl = TextEditingController();
  String? _verificationId;
  bool _codeSent = false;
  int? _resendToken;

  bool _busy = false;
  String? _error;

  FirebaseAuth get _auth => ref.read(firebaseAuthProvider);

  @override
  void dispose() {
    _tabs.dispose();
    _emailCtrl.dispose();
    _passwordCtrl.dispose();
    _phoneCtrl.dispose();
    _otpCtrl.dispose();
    super.dispose();
  }

  // ─── shared error wrapper ───────────────────────────────────────────────
  Future<void> _run(Future<void> Function() fn) async {
    setState(() { _busy = true; _error = null; });
    try {
      await fn();
    } on FirebaseAuthException catch (e) {
      if (mounted) setState(() => _error = _label(e));
    } catch (e, st) {
      // Log full error for debugging
      debugPrint('[Auth] Error: $e\n$st');
      if (mounted) setState(() => _error = _generic(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  static String _label(FirebaseAuthException e) => switch (e.code) {
        'invalid-email' => 'That email address is not valid.',
        'user-disabled' => 'This account has been disabled.',
        'user-not-found' => 'No account found — try creating one.',
        'wrong-password' => 'Incorrect password.',
        'email-already-in-use' => 'An account already exists for that email.',
        'weak-password' => 'Choose a stronger password (8+ characters).',
        'invalid-verification-code' => 'That code is incorrect.',
        'invalid-phone-number' => 'Enter a valid phone number with the country code.',
        'too-many-requests' => 'Too many attempts — please wait a few minutes.',
        'network-request-failed' => 'No internet connection.',
        'missing-verification-id' => 'Verification session expired. Request a new code.',
        'session-expired' => 'Verification session expired. Request a new code.',
        'quota-exceeded' => 'SMS quota exceeded. Try again later.',
        'captcha-check-failed' => 'reCAPTCHA verification failed. Try again.',
        _ => e.message ?? 'Something went wrong.',
      };

  static String _generic(Object e) {
    final s = e.toString();
    if (s.contains('network') || s.contains('SocketException')) {
      return 'No internet connection.';
    }
    if (s.contains('not configured') || s.contains('PlatformException')) {
      return 'Auth service not configured for this environment.';
    }
    if (s.contains('recaptcha') || s.contains('RECAPTCHA')) {
      return 'Security check failed. Please try again.';
    }
    return 'Sign-in failed — please try again.';
  }

  // ─── Google Sign-In ─────────────────────────────────────────────────────
  Future<void> _signInWithGoogle() => _run(() async {
        final googleUser = await GoogleSignIn().signIn();
        if (googleUser == null) return; // user cancelled
        final ga = await googleUser.authentication;
        final credential = GoogleAuthProvider.credential(
          idToken: ga.idToken,
          accessToken: ga.accessToken,
        );
        await _auth.signInWithCredential(credential);
      });

  // ─── Email auth ─────────────────────────────────────────────────────────
  Future<void> _emailAuth({required bool create}) => _run(() async {
        final email = _emailCtrl.text.trim();
        final pass = _passwordCtrl.text;
        if (email.isEmpty || pass.isEmpty) throw Exception('Please fill in email and password.');
        if (create) {
          await _auth.createUserWithEmailAndPassword(email: email, password: pass);
        } else {
          await _auth.signInWithEmailAndPassword(email: email, password: pass);
        }
      });

  // ─── Phone: send OTP ────────────────────────────────────────────────────
  Future<void> _sendOtp() => _run(() async {
        final raw = _phoneCtrl.text.trim().replaceAll(RegExp(r'\s+'), '');
        if (raw.isEmpty) throw Exception('Enter a phone number first.');
        final full = '${_country.dialCode}$raw';

        // Validate phone number format (basic E.164 check)
        if (!RegExp(r'^\+[1-9]\d{7,14}$').hasMatch(full)) {
          throw Exception('Invalid phone number format. Include country code.');
        }

        await _auth.verifyPhoneNumber(
          phoneNumber: full,
          forceResendingToken: _resendToken,
          verificationCompleted: (cred) async {
            // Auto-verification on Android
            try {
              await _auth.signInWithCredential(cred);
            } catch (_) {
              // Ignore auto-verification failures
            }
          },
          verificationFailed: (e) {
            if (mounted) {
              setState(() => _error = _label(e));
            }
          },
          codeSent: (id, resend) {
            if (mounted) {
              setState(() {
                _verificationId = id;
                _resendToken = resend;
                _codeSent = true;
                _error = null;
              });
            }
          },
          codeAutoRetrievalTimeout: (_) {},
          timeout: const Duration(seconds: 120), // Increased from 60s
        );
      });

  // ─── Phone: confirm OTP ──────────────────────────────────────────────────
  Future<void> _confirmOtp() => _run(() async {
        final id = _verificationId;
        final code = _otpCtrl.text.trim();
        if (id == null || code.isEmpty) throw Exception('Enter the 6-digit code sent to your phone.');
        if (code.length != 6) throw Exception('Code must be 6 digits.');
        final cred = PhoneAuthProvider.credential(verificationId: id, smsCode: code);
        await _auth.signInWithCredential(cred);
      });

  // ─── Resend ──────────────────────────────────────────────────────────────
  void _resetPhone() => setState(() {
        _codeSent = false;
        _verificationId = null;
        _otpCtrl.clear();
        _error = null;
      });

  // ─── Country picker bottom sheet ─────────────────────────────────────────
  Future<void> _pickCountry() async {
    final result = await showModalBottomSheet<_Country>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _CountryPicker(selected: _country),
    );
    if (result != null && mounted) setState(() => _country = result);
  }

  // ─── build ───────────────────────────────────────────────────────────────
  @override
  Widget build(BuildContext context) {
    final tt = Theme.of(context).textTheme;

    return Scaffold(
      backgroundColor: _tanBase,
      body: Stack(
        children: [
          // decorative blobs
          const Positioned(top: -80, right: -60, child: _Blob(color: Color(0x40D4748C), size: 260)),
          const Positioned(bottom: -60, left: -40, child: _Blob(color: Color(0x50F2B8C6), size: 200)),
          const Positioned(top: 140, left: -70, child: _Blob(color: Color(0x60EDD5B8), size: 160)),

          SafeArea(
            child: Center(
              child: SingleChildScrollView(
                padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 420),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      _buildHero(tt),
                      const SizedBox(height: 28),
                      _buildCard(tt),
                      if (_error != null) ...[
                        const SizedBox(height: 12),
                        _ErrorBanner(message: _error!),
                      ],
                      if (_busy) ...[
                        const SizedBox(height: 10),
                        LinearProgressIndicator(
                          color: _pink,
                          backgroundColor: _pinkLight.withValues(alpha: 0.3),
                          borderRadius: BorderRadius.circular(4),
                        ),
                      ],
                      const SizedBox(height: 24),
                      Text(
                        'By continuing you agree to our Terms of Service & Privacy Policy.',
                        style: tt.bodySmall?.copyWith(color: Colors.brown.shade400),
                        textAlign: TextAlign.center,
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  // ─── Hero ────────────────────────────────────────────────────────────────
  Widget _buildHero(TextTheme tt) => Column(
        children: [
          Container(
            width: 76,
            height: 76,
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [_pink, Color(0xFFE8A0B0)],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              borderRadius: BorderRadius.circular(22),
              boxShadow: [BoxShadow(color: _pink.withValues(alpha: 0.45), blurRadius: 22, offset: const Offset(0, 9))],
            ),
            child: const Icon(Icons.favorite_rounded, color: Colors.white, size: 40),
          ),
          const SizedBox(height: 14),
          Text('Muzz', style: tt.headlineLarge?.copyWith(color: _pinkDeep, fontWeight: FontWeight.w800, letterSpacing: -0.5)),
          const SizedBox(height: 4),
          Text('Find your perfect match', style: tt.bodyMedium?.copyWith(color: Colors.brown.shade400)),
        ],
      );

  // ─── Main Card ───────────────────────────────────────────────────────────
  Widget _buildCard(TextTheme tt) => Container(
        decoration: BoxDecoration(
          color: _tanCard.withValues(alpha: 0.92),
          borderRadius: BorderRadius.circular(28),
          border: Border.all(color: _pink.withValues(alpha: 0.18)),
          boxShadow: [
            BoxShadow(color: _pink.withValues(alpha: 0.13), blurRadius: 32, offset: const Offset(0, 12)),
            BoxShadow(color: _tanDark.withValues(alpha: 0.4), blurRadius: 8, offset: const Offset(0, 2)),
          ],
        ),
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // ── Google button
            _GoogleButton(busy: _busy, onPressed: _signInWithGoogle),
            const SizedBox(height: 16),
            _divider('or continue with email'),
            const SizedBox(height: 14),

            // ── Tab bar
            _StyledTabBar(controller: _tabs),
            const SizedBox(height: 16),

            // ── Email form
            AnimatedBuilder(
              animation: _tabs,
              builder: (_, __) {
                final create = _tabs.index == 1;
                return _EmailForm(
                  emailCtrl: _emailCtrl,
                  passwordCtrl: _passwordCtrl,
                  busy: _busy,
                  create: create,
                  showPw: _showPw,
                  onTogglePw: () => setState(() => _showPw = !_showPw),
                  onSubmit: () => _emailAuth(create: create),
                );
              },
            ),

            const SizedBox(height: 20),
            _divider('or verify with phone'),
            const SizedBox(height: 16),

            // ── Phone section
            _PhoneSection(
              country: _country,
              phoneCtrl: _phoneCtrl,
              otpCtrl: _otpCtrl,
              busy: _busy,
              codeSent: _codeSent,
              onPickCountry: _pickCountry,
              onSend: _sendOtp,
              onConfirm: _confirmOtp,
              onReset: _resetPhone,
            ),
          ],
        ),
      );

  Widget _divider(String label) => Row(children: [
        Expanded(child: Divider(color: _pink.withValues(alpha: 0.22))),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 10),
          child: Text(label, style: const TextStyle(fontSize: 12, color: _pinkDeep)),
        ),
        Expanded(child: Divider(color: _pink.withValues(alpha: 0.22))),
      ]);
}

// ═══════════════════════════════════════════════════════════════════════════
// Google Button
// ═══════════════════════════════════════════════════════════════════════════
class _GoogleButton extends StatelessWidget {
  const _GoogleButton({required this.busy, required this.onPressed});
  final bool busy;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) => OutlinedButton(
        onPressed: busy ? null : onPressed,
        style: OutlinedButton.styleFrom(
          minimumSize: const Size.fromHeight(52),
          side: const BorderSide(color: _pink, width: 1.6),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
          backgroundColor: _tanBase,
          foregroundColor: _pinkDeep,
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            // Coloured Google "G"
            Container(
              width: 26,
              height: 26,
              decoration: const BoxDecoration(shape: BoxShape.circle, color: Colors.white),
              padding: const EdgeInsets.all(3),
              child: CustomPaint(painter: _GoogleGPainter()),
            ),
            const SizedBox(width: 10),
            const Text('Continue with Google',
                style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15, color: _pinkDeep)),
          ],
        ),
      );
}

class _GoogleGPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    const colors = [Color(0xFF4285F4), Color(0xFF34A853), Color(0xFFFBBC05), Color(0xFFEA4335)];
    final center = Offset(size.width / 2, size.height / 2);
    final r = size.width / 2;
    final sweep = (2 * 3.14159265) / 4;
    final paint = Paint()..style = PaintingStyle.stroke..strokeWidth = size.width * 0.28;
    for (int i = 0; i < 4; i++) {
      paint.color = colors[i];
      canvas.drawArc(Rect.fromCircle(center: center, radius: r * 0.7),
          -3.14159265 / 2 + i * sweep, sweep - 0.08, false, paint);
    }
    // horizontal bar
    paint
      ..color = Color(0xFF4285F4)
      ..strokeWidth = size.width * 0.28;
    canvas.drawLine(
      Offset(center.dx, center.dy),
      Offset(size.width, center.dy),
      paint,
    );
  }

  @override
  bool shouldRepaint(covariant CustomPainter old) => false;
}

// ═══════════════════════════════════════════════════════════════════════════
// Styled Tab Bar
// ═══════════════════════════════════════════════════════════════════════════
class _StyledTabBar extends StatelessWidget {
  const _StyledTabBar({required this.controller});
  final TabController controller;

  @override
  Widget build(BuildContext context) => Container(
        decoration: BoxDecoration(
          color: _tanBase,
          borderRadius: BorderRadius.circular(12),
        ),
        padding: const EdgeInsets.all(3),
        child: TabBar(
          controller: controller,
          indicator: BoxDecoration(
            color: _pink,
            borderRadius: BorderRadius.circular(10),
            boxShadow: [BoxShadow(color: _pink.withValues(alpha: 0.3), blurRadius: 8, offset: const Offset(0, 2))],
          ),
          labelColor: Colors.white,
          unselectedLabelColor: _pinkDeep,
          dividerColor: Colors.transparent,
          labelStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
          unselectedLabelStyle: const TextStyle(fontWeight: FontWeight.w500, fontSize: 14),
          tabs: const [Tab(text: 'Sign in'), Tab(text: 'Create account')],
        ),
      );
}

// ═══════════════════════════════════════════════════════════════════════════
// Email Form
// ═══════════════════════════════════════════════════════════════════════════
class _EmailForm extends StatelessWidget {
  const _EmailForm({
    required this.emailCtrl,
    required this.passwordCtrl,
    required this.busy,
    required this.create,
    required this.showPw,
    required this.onTogglePw,
    required this.onSubmit,
  });

  final TextEditingController emailCtrl;
  final TextEditingController passwordCtrl;
  final bool busy;
  final bool create;
  final bool showPw;
  final VoidCallback onTogglePw;
  final VoidCallback onSubmit;

  InputDecoration _dec(String label, {Widget? suffix}) => InputDecoration(
        labelText: label,
        labelStyle: const TextStyle(color: _pinkDeep, fontSize: 14),
        filled: true,
        fillColor: _tanBase.withValues(alpha: 0.7),
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: _pink.withValues(alpha: 0.28)),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: _pink, width: 2),
        ),
        suffixIcon: suffix,
      );

  @override
  Widget build(BuildContext context) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          TextField(
            controller: emailCtrl,
            keyboardType: TextInputType.emailAddress,
            autofillHints: const [AutofillHints.email],
            decoration: _dec('Email address', suffix: const Icon(Icons.mail_outline, color: _pink, size: 20)),
          ),
          const SizedBox(height: 10),
          TextField(
            controller: passwordCtrl,
            obscureText: !showPw,
            autofillHints: const [AutofillHints.password],
            decoration: _dec(
              'Password',
              suffix: IconButton(
                icon: Icon(showPw ? Icons.visibility_off_outlined : Icons.visibility_outlined,
                    color: _pink, size: 20),
                onPressed: onTogglePw,
              ),
            ),
          ),
          const SizedBox(height: 14),
          FilledButton(
            onPressed: busy ? null : onSubmit,
            style: FilledButton.styleFrom(
              backgroundColor: _pink,
              minimumSize: const Size.fromHeight(50),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(13)),
              elevation: 0,
            ),
            child: Text(
              create ? 'Create account' : 'Sign in',
              style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
            ),
          ),
          if (!create) ...[
            const SizedBox(height: 4),
            Align(
              alignment: Alignment.centerRight,
              child: TextButton(
                onPressed: () {},
                style: TextButton.styleFrom(foregroundColor: _pinkDeep, padding: EdgeInsets.zero),
                child: const Text('Forgot password?', style: TextStyle(fontSize: 13)),
              ),
            ),
          ],
        ],
      );
}

// ═══════════════════════════════════════════════════════════════════════════
// Phone Section
// ═══════════════════════════════════════════════════════════════════════════
class _PhoneSection extends StatelessWidget {
  const _PhoneSection({
    required this.country,
    required this.phoneCtrl,
    required this.otpCtrl,
    required this.busy,
    required this.codeSent,
    required this.onPickCountry,
    required this.onSend,
    required this.onConfirm,
    required this.onReset,
  });

  final _Country country;
  final TextEditingController phoneCtrl;
  final TextEditingController otpCtrl;
  final bool busy;
  final bool codeSent;
  final VoidCallback onPickCountry;
  final VoidCallback onSend;
  final VoidCallback onConfirm;
  final VoidCallback onReset;

  @override
  Widget build(BuildContext context) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // label
          Row(children: [
            const Icon(Icons.phone_android_rounded, color: _pink, size: 18),
            const SizedBox(width: 6),
            const Text('Phone verification',
                style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14, color: _pinkDeep)),
          ]),
          const SizedBox(height: 10),

          if (!codeSent) ...[
            // ── Country + number row
            Row(
              children: [
                // Country selector chip
                GestureDetector(
                  onTap: busy ? null : onPickCountry,
                  child: Container(
                    height: 50,
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                    decoration: BoxDecoration(
                      color: _tanBase.withValues(alpha: 0.8),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: _pink.withValues(alpha: 0.30)),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(country.flag, style: const TextStyle(fontSize: 20)),
                        const SizedBox(width: 6),
                        Text(country.dialCode,
                            style: const TextStyle(fontWeight: FontWeight.w700, color: _pinkDeep, fontSize: 14)),
                        const SizedBox(width: 4),
                        const Icon(Icons.arrow_drop_down, color: _pink, size: 18),
                      ],
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                // Phone number field
                Expanded(
                  child: TextField(
                    controller: phoneCtrl,
                    keyboardType: TextInputType.phone,
                    inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                    autofillHints: const [AutofillHints.telephoneNumber],
                    decoration: InputDecoration(
                      hintText: 'Phone number',
                      hintStyle: TextStyle(color: Colors.brown.shade300, fontSize: 14),
                      filled: true,
                      fillColor: _tanBase.withValues(alpha: 0.7),
                      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
                      enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: BorderSide(color: _pink.withValues(alpha: 0.28)),
                      ),
                      focusedBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: const BorderSide(color: _pink, width: 2),
                      ),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            FilledButton.tonal(
              onPressed: busy ? null : onSend,
              style: FilledButton.styleFrom(
                backgroundColor: _pinkLight.withValues(alpha: 0.5),
                foregroundColor: _pinkDeep,
                minimumSize: const Size.fromHeight(50),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(13)),
                elevation: 0,
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: const [
                  Icon(Icons.sms_outlined, size: 18),
                  SizedBox(width: 8),
                  Text('Send verification code', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
                ],
              ),
            ),
          ] else ...[
            // ── OTP entry
            _OtpSuccessBanner(country: country, phoneCtrl: phoneCtrl),
            const SizedBox(height: 12),
            TextField(
              controller: otpCtrl,
              keyboardType: TextInputType.number,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(6)],
              autofillHints: const [AutofillHints.oneTimeCode],
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w800, letterSpacing: 10, color: _pinkDeep),
              decoration: InputDecoration(
                hintText: '• • • • • •',
                hintStyle: TextStyle(fontSize: 22, color: _pink.withValues(alpha: 0.35), letterSpacing: 8),
                filled: true,
                fillColor: _tanBase.withValues(alpha: 0.7),
                contentPadding: const EdgeInsets.symmetric(vertical: 16),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide(color: _pink.withValues(alpha: 0.28)),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: const BorderSide(color: _pink, width: 2),
                ),
              ),
            ),
            const SizedBox(height: 10),
            FilledButton(
              onPressed: busy ? null : onConfirm,
              style: FilledButton.styleFrom(
                backgroundColor: _pink,
                minimumSize: const Size.fromHeight(50),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(13)),
                elevation: 0,
              ),
              child: const Text('Verify code', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
            ),
            const SizedBox(height: 6),
            TextButton(
              onPressed: busy ? null : onReset,
              style: TextButton.styleFrom(foregroundColor: _pinkDeep),
              child: const Text('Change number / resend', style: TextStyle(fontSize: 13)),
            ),
          ],
        ],
      );
}

class _OtpSuccessBanner extends StatelessWidget {
  const _OtpSuccessBanner({required this.country, required this.phoneCtrl});
  final _Country country;
  final TextEditingController phoneCtrl;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: const Color(0xFFE8F5E9),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: const Color(0xFF81C784).withValues(alpha: 0.5)),
        ),
        child: Row(
          children: [
            const Icon(Icons.check_circle_outline, color: Color(0xFF388E3C), size: 18),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                'Code sent to ${country.flag} ${country.dialCode} ${phoneCtrl.text}',
                style: const TextStyle(color: Color(0xFF2E7D32), fontSize: 13, fontWeight: FontWeight.w500),
              ),
            ),
          ],
        ),
      );
}

// ═══════════════════════════════════════════════════════════════════════════
// Country Picker Bottom Sheet
// ═══════════════════════════════════════════════════════════════════════════
class _CountryPicker extends StatefulWidget {
  const _CountryPicker({required this.selected});
  final _Country selected;

  @override
  State<_CountryPicker> createState() => _CountryPickerState();
}

class _CountryPickerState extends State<_CountryPicker> {
  final _search = TextEditingController();
  List<_Country> _filtered = _countries;

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  void _onSearch(String q) {
    final lower = q.toLowerCase();
    setState(() {
      _filtered = q.isEmpty
          ? _countries
          : _countries.where((c) =>
              c.name.toLowerCase().contains(lower) || c.dialCode.contains(lower)).toList();
    });
  }

  @override
  Widget build(BuildContext context) {
    final h = MediaQuery.sizeOf(context).height * 0.75;
    return Container(
      height: h,
      decoration: const BoxDecoration(
        color: _tanCard,
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      child: Column(
        children: [
          // handle
          const SizedBox(height: 10),
          Container(width: 40, height: 4, decoration: BoxDecoration(color: _pink.withValues(alpha: 0.3), borderRadius: BorderRadius.circular(4))),
          const SizedBox(height: 14),
          // title
          const Text('Select Country', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 17, color: _pinkDeep)),
          const SizedBox(height: 14),
          // search
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 18),
            child: TextField(
              controller: _search,
              onChanged: _onSearch,
              autofocus: true,
              decoration: InputDecoration(
                hintText: 'Search country or dial code…',
                hintStyle: TextStyle(color: Colors.brown.shade300, fontSize: 14),
                prefixIcon: const Icon(Icons.search, color: _pink, size: 20),
                filled: true,
                fillColor: _tanBase,
                contentPadding: const EdgeInsets.symmetric(vertical: 12, horizontal: 14),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide(color: _pink.withValues(alpha: 0.25)),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: const BorderSide(color: _pink, width: 2),
                ),
              ),
            ),
          ),
          const SizedBox(height: 10),
          const Divider(height: 1),
          // list
          Expanded(
            child: _filtered.isEmpty
                ? const Center(child: Text('No results', style: TextStyle(color: _pinkDeep)))
                : ListView.builder(
                    itemCount: _filtered.length,
                    itemBuilder: (_, i) {
                      final c = _filtered[i];
                      final isSelected = c.code == widget.selected.code;
                      return ListTile(
                        leading: Text(c.flag, style: const TextStyle(fontSize: 26)),
                        title: Text(c.name,
                            style: TextStyle(
                                fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
                                color: isSelected ? _pinkDeep : Colors.brown.shade700,
                                fontSize: 15)),
                        trailing: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
                              decoration: BoxDecoration(
                                color: isSelected ? _pink : _tanBase,
                                borderRadius: BorderRadius.circular(20),
                                border: Border.all(color: _pink.withValues(alpha: 0.3)),
                              ),
                              child: Text(
                                c.dialCode,
                                style: TextStyle(
                                    color: isSelected ? Colors.white : _pinkDeep,
                                    fontWeight: FontWeight.w700,
                                    fontSize: 13),
                              ),
                            ),
                            if (isSelected) ...[
                              const SizedBox(width: 6),
                              const Icon(Icons.check_circle, color: _pink, size: 18),
                            ],
                          ],
                        ),
                        onTap: () => Navigator.of(context).pop(c),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Shared atoms
// ═══════════════════════════════════════════════════════════════════════════
class _Blob extends StatelessWidget {
  const _Blob({required this.color, required this.size});
  final Color color;
  final double size;

  @override
  Widget build(BuildContext context) => Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: color,
          boxShadow: [BoxShadow(color: color, blurRadius: size * 0.6)],
        ),
      );
}

class _ErrorBanner extends StatelessWidget {
  const _ErrorBanner({required this.message});
  final String message;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: const Color(0xFFFFEBEE),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: _pink.withValues(alpha: 0.4)),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Icon(Icons.error_outline, color: _pink, size: 18),
            const SizedBox(width: 8),
            Expanded(
              child: Semantics(
                liveRegion: true,
                child: Text(message, style: const TextStyle(color: _pinkDeep, fontSize: 13)),
              ),
            ),
          ],
        ),
      );
}