import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Secure storage for authentication tokens.
/// Uses flutter_secure_storage which provides encrypted storage on all platforms.
class AuthStorage {
  AuthStorage._(this._storage);

  final FlutterSecureStorage _storage;

  static const _accessTokenKey = 'auth_access_token';
  static const _refreshTokenKey = 'auth_refresh_token';
  static const _userIdKey = 'auth_user_id';

  /// Factory constructor that initializes with platform-appropriate options.
  factory AuthStorage() {
    const storage = FlutterSecureStorage(
      aOptions: AndroidOptions(
        encryptedSharedPreferences: true,
      ),
      iOptions: IOSOptions(
        accessibility: KeychainAccessibility.first_unlock_this_device,
      ),
      lOptions: LinuxOptions(),
      mOptions: MacOsOptions(),
    );
    return AuthStorage._(storage);
  }

  /// Store access and refresh tokens along with user ID.
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

  /// Get the stored access token.
  Future<String?> getAccessToken() async => _storage.read(key: _accessTokenKey);

  /// Get the stored refresh token.
  Future<String?> getRefreshToken() async => _storage.read(key: _refreshTokenKey);

  /// Get the stored user ID.
  Future<String?> getUserId() async => _storage.read(key: _userIdKey);

  /// Update just the access token (after refresh).
  Future<void> setAccessToken(String accessToken) async =>
      _storage.write(key: _accessTokenKey, value: accessToken);

  /// Clear all authentication data.
  Future<void> clear() async {
    await Future.wait([
      _storage.delete(key: _accessTokenKey),
      _storage.delete(key: _refreshTokenKey),
      _storage.delete(key: _userIdKey),
    ]);
  }

  /// Check if we have stored tokens (session exists).
  Future<bool> hasSession() async {
    final accessToken = await _storage.read(key: _accessTokenKey);
    final refreshToken = await _storage.read(key: _refreshTokenKey);
    return accessToken != null && refreshToken != null;
  }
}