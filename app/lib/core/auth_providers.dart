import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'api.dart';
import 'auth_storage.dart';
import 'google_signin_service.dart';
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
    } catch (e) {
      // Session invalid or expired
      await _authStorage.clear();
      state = const AuthState(status: AuthStatus.unauthenticated);
    }
  }

  /// Sign in with Google.
  Future<void> signInWithGoogle() async {
    state = state.copyWith(status: AuthStatus.authenticating, error: null);

    try {
      // Get Google ID token
      final idToken = await GoogleSignInService.signIn();
      if (idToken == null) {
        // User cancelled
        state = state.copyWith(status: AuthStatus.unauthenticated);
        return;
      }

      // Exchange ID token for app tokens
      final response = await _api.post<Map<String, dynamic>>(
        '/auth/google',
        body: {'idToken': idToken},
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