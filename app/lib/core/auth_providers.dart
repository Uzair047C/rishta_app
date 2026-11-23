import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:firebase_auth/firebase_auth.dart';

import 'api.dart';
import 'auth_storage.dart';
import 'auth/google_signin_service.dart';
import 'models.dart';
import 'providers.dart';

/// ------------------------------------------------------------------ auth storage

final authStorageProvider = Provider<AuthStorage>((ref) => AuthStorage());

/// ------------------------------------------------------------------ auth state

/// Represents the current authentication state.
enum AuthStatus {
  initial,        // App just started, checking for stored session
  unauthenticated, // No valid session
  authenticating,  // In the middle of sign-in flow
  authenticated,   // Valid session, user loaded
  onboarding,      // Authenticated but profile incomplete
}

/// Auth state holder.
class AuthState {
  const AuthState({
    required this.status,
    this.userId,
    this.profileComplete = false,
    this.error,
  });

  final AuthStatus status;
  final String? userId;
  final bool profileComplete;
  final String? error;

  bool get isAuthenticated => status == AuthStatus.authenticated;
  bool get isOnboarding => status == AuthStatus.onboarding;
  bool get needsOnboarding => isOnboarding || (isAuthenticated && !profileComplete);

  AuthState copyWith({
    AuthStatus? status,
    String? userId,
    bool? profileComplete,
    String? error,
  }) => AuthState(
    status: status ?? this.status,
    userId: userId ?? this.userId,
    profileComplete: profileComplete ?? this.profileComplete,
    error: error ?? this.error,
  );
}

/// Auth notifier managing the complete authentication lifecycle.
class AuthNotifier extends StateNotifier<AuthState> {
  AuthNotifier(this._authStorage, this._api) : super(const AuthState(status: AuthStatus.initial)) {
    _restoreSession();
  }

  final AuthStorage _authStorage;
  final Api _api;
  String? _pendingVerificationId;

  /// When the user ticked the 18+/terms checkbox — sent with the next login
  /// so the backend can store consent timestamps. Null = no fresh consent.
  DateTime? _consentAcceptedAt;

  /// Records fresh consent (called when the checkbox is ticked).
  void acceptTerms() => _consentAcceptedAt = DateTime.now().toUtc();

  /// Consent payload sent alongside login requests.
  List<Map<String, String>> _consentPayload() {
    final at = _consentAcceptedAt;
    if (at == null) return const [];
    final iso = at.toIso8601String();
    _consentAcceptedAt = null; // one-shot: only the accepting session sends it
    return [
      {'document': 'terms', 'acceptedAt': iso},
      {'document': 'privacy', 'acceptedAt': iso},
    ];
  }

  /// Restore session from secure storage on app startup.
  Future<void> _restoreSession() async {
    state = const AuthState(status: AuthStatus.authenticating);
    try {
      final hasSession = await _authStorage.hasSession();
      if (!hasSession) {
        state = const AuthState(status: AuthStatus.unauthenticated);
        return;
      }

      final userId = await _authStorage.getUserId();
      if (userId == null) {
        await _authStorage.clear();
        state = const AuthState(status: AuthStatus.unauthenticated);
        return;
      }

      // Validate the session by fetching user profile
      final profile = await _api.get<MyProfile>(
        '/profile',
        (j) => MyProfile.fromJson(j as Map<String, dynamic>),
      );

      state = AuthState(
        status: AuthStatus.authenticated,
        userId: userId,
        profileComplete: profile.isComplete,
      );

      // If profile incomplete, transition to onboarding
      if (!profile.isComplete) {
        state = state.copyWith(status: AuthStatus.onboarding);
      }
    } on ApiException catch (e) {
      // Only clear session on real auth rejections from the server
      // (401/403), never on network errors — offline launch stays signed in.
      if (e.statusCode == 401 || e.statusCode == 403) {
        await _authStorage.clear();
        state = const AuthState(status: AuthStatus.unauthenticated);
      } else {
        // Network/5xx error - keep tokens and the session, surface the error.
        // hasSession() is still true, so the next launch (or retry via
        // signInWithGoogle → Api retry-on-401) re-validates silently.
        state = AuthState(status: AuthStatus.authenticating, error: 'Network error. Retrying when online…');
      }
    } catch (e) {
      // Unknown (non-API) failure: don't clear a valid session on a guess —
      // treat it like a network error and keep the stored tokens.
      state = const AuthState(status: AuthStatus.authenticating, error: 'Something went wrong. Please try again.');
    }
  }

  /// Sign in with Google.
  Future<void> signInWithGoogle() async {
    state = state.copyWith(status: AuthStatus.authenticating, error: null);

    try {
      // Google → Firebase: exchange the Google token for a Firebase credential,
      // then the single /auth/firebase path (same as email/phone).
      final idToken = await GoogleSignInService.signIn();
      if (idToken == null) {
        // User cancelled
        state = state.copyWith(status: AuthStatus.unauthenticated);
        return;
      }

      final googleAuth = GoogleAuthProvider.credential(idToken: idToken);
      final fbUser =
          (await FirebaseAuth.instance.signInWithCredential(googleAuth)).user;
      if (fbUser == null) {
        throw Exception('Firebase sign-in failed');
      }
      final firebaseIdToken = await fbUser.getIdToken();
      if (firebaseIdToken == null) {
        throw Exception('Failed to obtain Firebase ID token');
      }

      final response = await _api.post<Map<String, dynamic>>(
        '/auth/firebase',
        body: {'idToken': firebaseIdToken, 'consent': _consentPayload()},
        requiresAuth: false,
      );

      final accessToken = response['accessToken'] as String;
      final refreshToken = response['refreshToken'] as String;
      final user = response['user'] as Map<String, dynamic>;
      final profileComplete = response['profileComplete'] as bool;
      final userId = user['id'] as String;

      // Store tokens securely
      await _authStorage.setTokens(
        accessToken: accessToken,
        refreshToken: refreshToken,
        userId: userId,
      );

      // Update state
      state = AuthState(
        status: profileComplete ? AuthStatus.authenticated : AuthStatus.onboarding,
        userId: userId,
        profileComplete: profileComplete,
      );
    } on ApiException catch (e) {
      state = state.copyWith(
        status: AuthStatus.unauthenticated,
        error: e.error.message,
      );
      rethrow;
    } on GoogleSignInError catch (e) {
      state = state.copyWith(
        status: AuthStatus.unauthenticated,
        error: e.message,
      );
      rethrow;
    } catch (e) {
      state = state.copyWith(
        status: AuthStatus.unauthenticated,
        error: 'Sign in failed: $e',
      );
      rethrow;
    }
  }

  /// Sign up with email and password via Firebase Auth.
  /// Sends email verification, then exchanges Firebase ID token for app tokens.
  Future<void> signUpWithEmail(String email, String password) async {
    state = state.copyWith(status: AuthStatus.authenticating, error: null);

    try {
      final credential = await FirebaseAuth.instance.createUserWithEmailAndPassword(
        email: email,
        password: password,
      );

      // Send email verification
      await credential.user?.sendEmailVerification();

      // Get Firebase ID token
      final idToken = await credential.user!.getIdToken();
      if (idToken == null) {
        throw Exception('Failed to obtain Firebase ID token');
      }

      // Exchange Firebase ID token for app tokens
      final response = await _api.post<Map<String, dynamic>>(
        '/auth/firebase',
        body: {'idToken': idToken, 'consent': _consentPayload()},
        requiresAuth: false,
      );

      final accessToken = response['accessToken'] as String;
      final refreshToken = response['refreshToken'] as String;
      final user = response['user'] as Map<String, dynamic>;
      final profileComplete = response['profileComplete'] as bool;
      final userId = user['id'] as String;

      await _authStorage.setTokens(
        accessToken: accessToken,
        refreshToken: refreshToken,
        userId: userId,
      );

      state = AuthState(
        status: profileComplete ? AuthStatus.authenticated : AuthStatus.onboarding,
        userId: userId,
        profileComplete: profileComplete,
      );
    } on FirebaseAuthException catch (e) {
      state = state.copyWith(
        status: AuthStatus.unauthenticated,
        error: _mapFirebaseAuthError(e.code),
      );
      rethrow;
    } on ApiException catch (e) {
      state = state.copyWith(
        status: AuthStatus.unauthenticated,
        error: e.error.message,
      );
      rethrow;
    } catch (e) {
      state = state.copyWith(
        status: AuthStatus.unauthenticated,
        error: 'Sign up failed: $e',
      );
      rethrow;
    }
  }

  /// Sign in with email and password via Firebase Auth.
  /// Checks email verification, then exchanges Firebase ID token for app tokens.
  Future<void> signInWithEmail(String email, String password) async {
    state = state.copyWith(status: AuthStatus.authenticating, error: null);

    try {
      final credential = await FirebaseAuth.instance.signInWithEmailAndPassword(
        email: email,
        password: password,
      );

      // Check email verification
      if (!credential.user!.emailVerified) {
        await credential.user!.sendEmailVerification();
        throw Exception('Email not verified. A new verification email has been sent.');
      }

      // Get Firebase ID token
      final idToken = await credential.user!.getIdToken();
      if (idToken == null) {
        throw Exception('Failed to obtain Firebase ID token');
      }

      // Exchange Firebase ID token for app tokens
      final response = await _api.post<Map<String, dynamic>>(
        '/auth/firebase',
        body: {'idToken': idToken, 'consent': _consentPayload()},
        requiresAuth: false,
      );

      final accessToken = response['accessToken'] as String;
      final refreshToken = response['refreshToken'] as String;
      final user = response['user'] as Map<String, dynamic>;
      final profileComplete = response['profileComplete'] as bool;
      final userId = user['id'] as String;

      await _authStorage.setTokens(
        accessToken: accessToken,
        refreshToken: refreshToken,
        userId: userId,
      );

      state = AuthState(
        status: profileComplete ? AuthStatus.authenticated : AuthStatus.onboarding,
        userId: userId,
        profileComplete: profileComplete,
      );
    } on FirebaseAuthException catch (e) {
      state = state.copyWith(
        status: AuthStatus.unauthenticated,
        error: _mapFirebaseAuthError(e.code),
      );
      rethrow;
    } on ApiException catch (e) {
      state = state.copyWith(
        status: AuthStatus.unauthenticated,
        error: e.error.message,
      );
      rethrow;
    } catch (e) {
      state = state.copyWith(
        status: AuthStatus.unauthenticated,
        error: 'Sign in failed: $e',
      );
      rethrow;
    }
  }

  String _mapFirebaseAuthError(String code) {
    return switch (code) {
      'weak-password' => 'Password is too weak (min 6 characters).',
      'email-already-in-use' => 'An account with this email already exists.',
      'invalid-email' => 'Invalid email address.',
      'user-not-found' => 'No account found with this email.',
      'wrong-password' => 'Incorrect password.',
      'user-disabled' => 'This account has been disabled.',
      'too-many-requests' => 'Too many attempts. Please try again later.',
      'operation-not-allowed' => 'Email/password sign-in is not enabled.',
      _ => 'Authentication failed: $code',
    };
  }

  /// Phone OTP: step 1 — send the code. Firebase delivers the SMS; the
  /// verification id is held in memory until [verifyPhoneOtp].
  Future<void> sendPhoneOtp(String phoneNumber) async {
    state = state.copyWith(status: AuthStatus.authenticating, error: null);
    await FirebaseAuth.instance.verifyPhoneNumber(
      phoneNumber: phoneNumber,
      timeout: const Duration(seconds: 60),
      verificationCompleted: (credential) => _exchangeFirebaseToken(credential),
      verificationFailed: (e) {
        state = state.copyWith(
          status: AuthStatus.unauthenticated,
          error: _mapFirebaseAuthError(e.code),
        );
      },
      codeSent: (verificationId, _) {
        _pendingVerificationId = verificationId;
        state = state.copyWith(status: AuthStatus.unauthenticated, error: null);
      },
      codeAutoRetrievalTimeout: (verificationId) => _pendingVerificationId = verificationId,
    );
  }

  /// Phone OTP: step 2 — verify the code and exchange for app tokens.
  Future<void> verifyPhoneOtp(String smsCode) async {
    final verificationId = _pendingVerificationId;
    if (verificationId == null) {
      state = state.copyWith(status: AuthStatus.unauthenticated, error: 'Request a code first.');
      return;
    }
    final credential = PhoneAuthProvider.credential(verificationId: verificationId, smsCode: smsCode);
    await _exchangeFirebaseToken(credential);
  }

  /// Shared tail of every Firebase sign-in: ID token -> app tokens -> state.
  Future<void> _exchangeFirebaseToken(Object credential) async {
    try {
      final user = credential is AuthCredential
          ? (await FirebaseAuth.instance.signInWithCredential(credential)).user
          : null;
      if (user == null) throw Exception('Firebase sign-in failed');

      final idToken = await user.getIdToken();
      if (idToken == null) throw Exception('Failed to obtain Firebase ID token');

      final response = await _api.post<Map<String, dynamic>>(
        '/auth/firebase',
        body: {'idToken': idToken, 'consent': _consentPayload()},
        requiresAuth: false,
      );

      final accessToken = response['accessToken'] as String;
      final refreshToken = response['refreshToken'] as String;
      final userJson = response['user'] as Map<String, dynamic>;
      final profileComplete = response['profileComplete'] as bool;
      final userId = userJson['id'] as String;

      await _authStorage.setTokens(
        accessToken: accessToken,
        refreshToken: refreshToken,
        userId: userId,
      );

      state = AuthState(
        status: profileComplete ? AuthStatus.authenticated : AuthStatus.onboarding,
        userId: userId,
        profileComplete: profileComplete,
      );
    } on ApiException catch (e) {
      state = state.copyWith(status: AuthStatus.unauthenticated, error: e.error.message);
      rethrow;
    } catch (e) {
      state = state.copyWith(status: AuthStatus.unauthenticated, error: 'Sign in failed: $e');
      rethrow;
    }
  }

  /// Sign out and clear all auth data.
  Future<void> signOut() async {
    // Best effort: tell backend to revoke tokens
    if (state.userId != null) {
      try {
        final refreshToken = await _authStorage.getRefreshToken();
        if (refreshToken != null) {
          await _api.post('/auth/logout', body: {'refreshToken': refreshToken});
        }
      } catch (_) {
        // Ignore backend logout errors
      }
    }

    // Disconnect Google so the next sign-in shows the account picker
    try {
      await GoogleSignInService.signOut();
    } catch (_) {
      // Ignore Google sign-out errors
    }

    // Clear local storage
    await _authStorage.clear();
    _api.clearCachedToken();

    state = const AuthState(status: AuthStatus.unauthenticated);
  }

  /// Update profile completion status (called after onboarding finishes).
  void setProfileComplete() {
    if (state.isOnboarding) {
      state = state.copyWith(status: AuthStatus.authenticated, profileComplete: true);
    }
  }

  /// Clear error message.
  void clearError() {
    if (state.error != null) {
      state = state.copyWith(error: null);
    }
  }
}

final authProvider = StateNotifierProvider<AuthNotifier, AuthState>((ref) {
  final authStorage = ref.watch(authStorageProvider);
  final api = ref.watch(apiProvider);
  return AuthNotifier(authStorage, api);
});

/// Convenience provider for just the auth status.
final authStatusProvider = Provider<AuthStatus>((ref) => ref.watch(authProvider).status);

/// Convenience provider for current user ID.
final currentUserIdProvider = Provider<String?>((ref) => ref.watch(authProvider).userId);