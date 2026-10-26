import 'package:js/js.dart';
import 'package:flutter/foundation.dart';
import 'package:google_sign_in/google_sign_in.dart';

/// Service for handling Google Sign-In flow.
/// Uses google_sign_in package to obtain Google ID token.
class GoogleSignInService {
  static String? _webClientId;

  /// Initialize Google Sign-In - must be called before signIn() on web.
  /// Reads client ID from JS global (flutter_bootstrap.js).
  static Future<void> initialize() async {
    if (kIsWeb) {
      _webClientId = _getGoogleClientId();
      if (_webClientId == null || _webClientId!.isEmpty) {
        throw GoogleSignInError('GOOGLE_SERVER_CLIENT_ID not configured in flutter_bootstrap.js');
      }
    }
    // No-op for other platforms; GoogleSignIn initializes lazily.
  }

  static GoogleSignIn get _googleSignIn => GoogleSignIn(
    scopes: ['email', 'profile', 'openid'],
    // serverClientId is only for Android/iOS (not supported on Web)
    serverClientId: kIsWeb ? null : const String.fromEnvironment('GOOGLE_SERVER_CLIENT_ID'),
    // For web, clientId is required - pass the Web client ID from JS global
    clientId: kIsWeb ? _webClientId : const String.fromEnvironment('GOOGLE_SERVER_CLIENT_ID'),
  );

  /// Sign in with Google and get the ID token.
  /// Returns the ID token string, or null if user cancelled.
  /// Throws [GoogleSignInError] on failure.
  static Future<String?> signIn() async {
    try {
      final account = await _googleSignIn.signIn();
      if (account == null) {
        // User cancelled the sign-in flow
        return null;
      }

      final auth = await account.authentication;
      final idToken = auth.idToken;
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

  /// Sign out from Google.
  static Future<void> signOut() async {
    await _googleSignIn.signOut();
  }

  /// Check if user is currently signed in to Google.
  static Future<bool> isSignedIn() async => _googleSignIn.isSignedIn();

  /// Get the currently signed-in Google account (without prompting).
  static GoogleSignInAccount? get currentUser => _googleSignIn.currentUser;
}

/// Error class for Google Sign-In failures.
class GoogleSignInError implements Exception {
  GoogleSignInError(this.message);

  final String message;

  @override
  String toString() => 'GoogleSignInError: $message';
}

@JS('GOOGLE_SERVER_CLIENT_ID')
external String? get _googleServerClientId;

String? _getGoogleClientId() => _googleServerClientId;