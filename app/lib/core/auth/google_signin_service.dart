import 'package:flutter/foundation.dart';
import 'package:google_sign_in/google_sign_in.dart';

import 'google_signin_service_stub.dart'
    if (dart.library.js_interop) 'google_signin_service_web.dart';

/// Service for handling Google Sign-In flow.
/// One cached GoogleSignIn instance; configured once by [initialize].
class GoogleSignInService {
  static GoogleSignIn? _instance;
  static bool _initialized = false;

  /// Initialize Google Sign-In. Never throws — safe to call from main().
  /// Web client ID comes from window.GOOGLE_SERVER_CLIENT_ID (flutter_bootstrap.js);
  /// on mobile the web client ID is passed via --dart-define=GOOGLE_SERVER_CLIENT_ID.
  static Future<void> initialize() async {
    if (_initialized) return;
    _initialized = true;
    try {
      final webClientId = kIsWeb
          ? await getGoogleClientId() ?? ''
          : const String.fromEnvironment('GOOGLE_SERVER_CLIENT_ID');
      if (webClientId.isEmpty) {
        debugPrint('GOOGLE_SERVER_CLIENT_ID not configured — Google sign-in disabled');
        return;
      }

      // iOS needs its own clientId (no google-services.json equivalent);
      // Android reads its client from google-services.json.
      const iosClientId = String.fromEnvironment('GOOGLE_IOS_CLIENT_ID');

      _instance = GoogleSignIn(
        scopes: ['email', 'profile', 'openid'],
        // serverClientId = the Web client ID: the ID token's aud claim the
        // backend verifies against.
        serverClientId: webClientId,
        clientId: (!kIsWeb && iosClientId.isNotEmpty)
            ? iosClientId
            : (kIsWeb ? webClientId : null),
      );
    } catch (e) {
      debugPrint('GoogleSignInService.initialize failed: $e');
    }
  }

  /// Sign in with Google and get the raw Google ID token.
  /// Returns null if the user cancelled. Throws [GoogleSignInError] on failure.
  static Future<String?> signIn() async {
    final signIn = _instance;
    if (signIn == null) {
      throw GoogleSignInError('Google Sign-In not initialized (missing client ID config)');
    }
    try {
      final account = await signIn.signIn();
      if (account == null) return null; // user cancelled

      final idToken = await account.authentication.then((a) => a.idToken);
      if (idToken == null) {
        throw GoogleSignInError('Failed to obtain ID token from Google');
      }
      return idToken;
    } on GoogleSignInError {
      rethrow;
    } catch (e) {
      throw GoogleSignInError('Google Sign-In failed: $e');
    }
  }

  /// Sign out from Google (does not dispose the cached instance).
  static Future<void> signOut() async {
    await _instance?.signOut();
  }

  /// Check if user is currently signed in to Google.
  static Future<bool> isSignedIn() async => _instance?.isSignedIn() ?? false;

  /// Get the currently signed-in Google account (without prompting).
  static GoogleSignInAccount? get currentUser => _instance?.currentUser;
}

/// Error class for Google Sign-In failures.
class GoogleSignInError implements Exception {
  GoogleSignInError(this.message);

  final String message;

  @override
  String toString() => 'GoogleSignInError: $message';
}
