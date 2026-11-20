import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';

/// Auth status enum
enum AuthStatus { initial, unauthenticated, authenticating, authenticated, onboarding }

/// Auth state
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

/// Secure storage for tokens
class AuthStorage {
  static const _storage = FlutterSecureStorage();
  static const _accessTokenKey = 'access_token';
  static const _refreshTokenKey = 'refresh_token';
  static const _userIdKey = 'user_id';

  Future<void> setTokens({
    required String accessToken,
    required String refreshToken,
    required String userId,
  }) async {
    await Future.wait([
      _storage.write(key: _accessTokenKey, value: accessToken),
      _storage.write(key: _refreshTokenKey, value: refreshToken),
      _storage.write(key: _userIdKey, value: userId),
    ]);
  }

  Future<String?> getAccessToken() => _storage.read(key: _accessTokenKey);
  Future<String?> getRefreshToken() => _storage.read(key: _refreshTokenKey);
  Future<String?> getUserId() => _storage.read(key: _userIdKey);
  Future<bool> hasSession() async => (await getAccessToken()) != null;

  Future<void> clear() async {
    await Future.wait([
      _storage.delete(key: _accessTokenKey),
      _storage.delete(key: _refreshTokenKey),
      _storage.delete(key: _userIdKey),
    ]);
  }
}

/// API client with auth
class Api {
  final String baseUrl;
  String? _cachedAccessToken;

  Api({required this.baseUrl});

  void setAccessToken(String? token) => _cachedAccessToken = token;
  void clearCachedToken() => _cachedAccessToken = null;

  Future<T> get<T>(String path, T Function(dynamic) fromJson, {bool requiresAuth = true}) async {
    final headers = <String, String>{'Content-Type': 'application/json'};
    if (requiresAuth) {
      final token = await _getValidAccessToken();
      if (token != null) headers['Authorization'] = 'Bearer $token';
    }
    final res = await http.get(Uri.parse('$baseUrl$path'), headers: headers);
    return _handleResponse(res, fromJson);
  }

  Future<T> post<T>(String path, Map<String, dynamic> body, T Function(dynamic) fromJson, {bool requiresAuth = true}) async {
    final headers = <String, String>{'Content-Type': 'application/json'};
    if (requiresAuth) {
      final token = await _getValidAccessToken();
      if (token != null) headers['Authorization'] = 'Bearer $token';
    }
    final res = await http.post(Uri.parse('$baseUrl$path'), headers: headers, body: jsonEncode(body));
    return _handleResponse(res, fromJson);
  }

  Future<String?> _getValidAccessToken() async {
    if (_cachedAccessToken != null) return _cachedAccessToken;
    // In a real app, you'd refresh here if expired
    return _cachedAccessToken;
  }

  T _handleResponse<T>(http.Response res, T Function(dynamic) fromJson) {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      return fromJson(jsonDecode(res.body));
    }
    throw Exception('API Error: ${res.statusCode} ${res.body}');
  }
}

/// Google Sign-In service
class GoogleSignInService {
  static String? _webClientId;

  static Future<void> initialize() async {
    if (kIsWeb) {
      _webClientId = _getGoogleClientIdWeb();
      if (_webClientId == null || _webClientId!.isEmpty) {
        throw Exception('GOOGLE_SERVER_CLIENT_ID not configured');
      }
    }
  }

  static GoogleSignIn get _googleSignIn => GoogleSignIn(
    scopes: ['email', 'profile', 'openid'],
    serverClientId: kIsWeb ? null : const String.fromEnvironment('GOOGLE_SERVER_CLIENT_ID'),
    clientId: kIsWeb ? _webClientId : const String.fromEnvironment('GOOGLE_SERVER_CLIENT_ID'),
  );

  static Future<String?> signIn() async {
    try {
      final account = await _googleSignIn.signIn();
      if (account == null) return null;
      final auth = await account.authentication;
      return auth.idToken;
    } catch (e) {
      throw Exception('Google Sign-In failed: $e');
    }
  }

  static Future<void> signOut() async => _googleSignIn.signOut();
}

/// Web implementation - only compiled for web
String? _getGoogleClientIdWeb() {
  if (kIsWeb) {
    // Reads from window.GOOGLE_SERVER_CLIENT_ID set in flutter_bootstrap.js
    return _getGoogleClientIdWebJS();
  }
  return null;
}

@pragma('vm:entry-point')
external String? _getGoogleClientIdWebJS();

/// Auth notifier
class AuthNotifier extends StateNotifier<AuthState> {
  AuthNotifier(this._authStorage, this._api) : super(const AuthState(status: AuthStatus.initial)) {
    _restoreSession();
  }

  final AuthStorage _authStorage;
  final Api _api;

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
      // Validate session with backend
      final profile = await _api.get('/profile', (j) => Profile.fromJson(j as Map<String, dynamic>));
      state = AuthState(
        status: AuthStatus.authenticated,
        userId: userId,
        profileComplete: profile.isComplete,
      );
      if (!profile.isComplete) {
        state = state.copyWith(status: AuthStatus.onboarding);
      }
    } catch (e) {
      await _authStorage.clear();
      state = const AuthState(status: AuthStatus.unauthenticated);
    }
  }

  Future<void> signInWithGoogle() async {
    state = state.copyWith(status: AuthStatus.authenticating, error: null);
    try {
      final idToken = await GoogleSignInService.signIn();
      if (idToken == null) {
        state = state.copyWith(status: AuthStatus.unauthenticated);
        return;
      }
      final response = await _api.post<Map<String, dynamic>>(
        '/auth/google',
        {'idToken': idToken},
        (j) => j as Map<String, dynamic>,
        requiresAuth: false,
      );
      final accessToken = response['accessToken'] as String;
      final refreshToken = response['refreshToken'] as String;
      final user = response['user'] as Map<String, dynamic>;
      final profileComplete = response['profileComplete'] as bool;
      final userId = user['id'] as String;
      await _authStorage.setTokens(accessToken: accessToken, refreshToken: refreshToken, userId: userId);
      _api.setAccessToken(accessToken);
      state = AuthState(
        status: profileComplete ? AuthStatus.authenticated : AuthStatus.onboarding,
        userId: userId,
        profileComplete: profileComplete,
      );
    } on Exception catch (e) {
      state = state.copyWith(status: AuthStatus.unauthenticated, error: e.toString().replaceFirst('Exception: ', ''));
      rethrow;
    }
  }

  Future<void> signOut() async {
    if (state.userId != null) {
      try {
        final refreshToken = await _authStorage.getRefreshToken();
        if (refreshToken != null) {
          await _api.post('/auth/logout', {'refreshToken': refreshToken}, (j) => j);
        }
      } catch (_) {}
    }
    await _authStorage.clear();
    _api.clearCachedToken();
    state = const AuthState(status: AuthStatus.unauthenticated);
  }

  void setProfileComplete() {
    if (state.isOnboarding) {
      state = state.copyWith(status: AuthStatus.authenticated, profileComplete: true);
    }
  }

  void clearError() {
    if (state.error != null) state = state.copyWith(error: null);
  }
}

/// Simple profile model
class Profile {
  final bool isComplete;
  Profile({required this.isComplete});
  factory Profile.fromJson(Map<String, dynamic> json) => Profile(isComplete: json['isComplete'] ?? false);
}

/// Providers
final authStorageProvider = Provider<AuthStorage>((ref) => AuthStorage());
final apiProvider = Provider<Api>((ref) => Api(baseUrl: 'http://localhost:3000'));
final authProvider = StateNotifierProvider<AuthNotifier, AuthState>((ref) {
  return AuthNotifier(ref.watch(authStorageProvider), ref.watch(apiProvider));
});