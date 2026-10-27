import 'dart:convert';
import 'package:flutter/foundation.dart';

import 'package:http/http.dart' as http;
import 'auth_storage.dart';

/// Server error codes the UI branches on. Anything unrecognised becomes [unknown]
/// so a new backend code degrades to a generic message instead of crashing.
enum ApiError {
  noLikesRemaining,
  subscriptionInactive,
  underAge,
  deviceLimitReached,
  profileIncomplete,
  notRegistered,
  blocked,
  unknown;

  static ApiError parse(String? code) => switch (code) {
        'no_likes_remaining' => ApiError.noLikesRemaining,
        'subscription_inactive' => ApiError.subscriptionInactive,
        'under_min_age' => ApiError.underAge,
        'device_account_limit_reached' => ApiError.deviceLimitReached,
        'profile_incomplete' => ApiError.profileIncomplete,
        'not_registered' => ApiError.notRegistered,
        'blocked' => ApiError.blocked,
        _ => ApiError.unknown,
      };

  /// Shown to the user. The like-quota and lapse cases are the ones spec 1.2
  /// insists must be explicit rather than a silently failing button.
  String get message => switch (this) {
        ApiError.noLikesRemaining => 'You have used all your likes for today. Come back tomorrow or upgrade.',
        ApiError.subscriptionInactive => 'Your subscription has lapsed. Upgrade to send new likes — your matches and chats are still here.',
        ApiError.underAge => 'You must be at least 18 to use Rishta.',
        ApiError.deviceLimitReached => 'Too many accounts have been created from this device.',
        ApiError.profileIncomplete => 'Finish your profile before browsing.',
        ApiError.notRegistered => 'Please sign in again.',
        ApiError.blocked => 'This profile is not available.',
        ApiError.unknown => 'Something went wrong. Please try again.',
      };
}

class ApiException implements Exception {
  ApiException(this.statusCode, this.code, this.raw);

  final int statusCode;
  final String code;
  final String raw;

  ApiError get error => ApiError.parse(code);

  @override
  String toString() => 'ApiException($statusCode, $code)';
}

/// Standard report reasons, shared by feed and match reporting.
const kReportReasons = ['Inappropriate photos', 'Harassment', 'Fake profile', 'Spam or scam'];

/// HTTP client for the Rishta API.
///
/// Generic over the decoded body: callers pass the parse function, so there is
/// one request path for every endpoint rather than a method per route.
class Api {
  Api({
    http.Client? client,
    String? baseUrl,
    AuthStorage? authStorage,
  }) : _client = client ?? http.Client(),
       _base = baseUrl ??
           const String.fromEnvironment('API_BASE', defaultValue: 'http://localhost:3000'),
       _authStorage = authStorage ?? AuthStorage();

  final http.Client _client;
  final String _base;
  final AuthStorage _authStorage;

  static const _timeout = Duration(seconds: 20);

  /// Current access token (cached after first read).
  String? _cachedAccessToken;

  /// Gets the access token, loading from storage if needed.
  Future<String?> _getAccessToken() async {
    if (_cachedAccessToken != null) return _cachedAccessToken;
    _cachedAccessToken = await _authStorage.getAccessToken();
    return _cachedAccessToken;
  }

  /// Clears the cached access token (call after refresh or logout).
  void clearCachedToken() {
    _cachedAccessToken = null;
  }

  Future<T> get<T>(String path, T Function(Object? json) parse, {Map<String, Object?>? query, bool requiresAuth = true}) =>
      request('GET', path, parse: parse, query: query, requiresAuth: requiresAuth);

  Future<T> post<T>(String path, {Object? body, T Function(Object? json)? parse, bool requiresAuth = true}) =>
      request('POST', path, body: body, parse: parse ?? (json) => json as T, requiresAuth: requiresAuth);

  Future<T> put<T>(String path, {Object? body, T Function(Object? json)? parse, bool requiresAuth = true}) =>
      request('PUT', path, body: body, parse: parse ?? (json) => json as T, requiresAuth: requiresAuth);

  Future<T> delete<T>(String path, {Object? body, T Function(Object? json)? parse, bool requiresAuth = true}) =>
      request('DELETE', path, body: body, parse: parse ?? (json) => json as T, requiresAuth: requiresAuth);

  Future<T> request<T>(
    String method,
    String path, {
    required T Function(Object? json) parse,
    Object? body,
    Map<String, Object?>? query,
    bool requiresAuth = true,
  }) async {
    final uri = Uri.parse('$_base$path').replace(
      queryParameters: query?.map((k, v) => MapEntry(k, v?.toString())),
    );

    final request = http.Request(method, uri)
      ..headers['content-type'] = 'application/json';

    // Add Authorization header if auth is required
    if (requiresAuth) {
      final accessToken = await _getAccessToken();
      if (accessToken != null) {
        request.headers['authorization'] = 'Bearer $accessToken';
      }
    }

    if (body != null) request.body = jsonEncode(body);

    // Request logging
    if (kDebugMode) {
      debugPrint('API Request: $method $_base$path');
      if (query?.isNotEmpty ?? false) debugPrint('  Query: $query');
      if (body != null) debugPrint('  Body: $body');
    }

    final startTime = DateTime.now();
    final response = await http.Response.fromStream(await _client.send(request)).timeout(_timeout);
    final duration = DateTime.now().difference(startTime).inMilliseconds;
    final decoded = response.body.isEmpty ? null : jsonDecode(response.body);

    // Response logging
    if (kDebugMode) {
      debugPrint('API Response: $method $_base$path ${response.statusCode} (${duration}ms)');
      if (response.statusCode >= 400) {
        debugPrint('  Error: ${response.statusCode} - ${_messageOf(decoded)}');
        debugPrint('  Response body: ${response.body}');
      } else if (kDebugMode && response.body.isNotEmpty) {
        debugPrint('  Response: ${response.body}');
      }
    }

    // Handle 401: try to refresh token and retry once
    if (response.statusCode == 401 && requiresAuth) {
      final refreshed = await _tryRefreshToken();
      if (refreshed) {
        // Retry the request with new token
        final retryRequest = http.Request(method, uri)
          ..headers['content-type'] = 'application/json'
          ..headers['authorization'] = 'Bearer $_cachedAccessToken';
        if (body != null) retryRequest.body = jsonEncode(body);

        final startTime2 = DateTime.now();
        final retryResponse = await http.Response.fromStream(await _client.send(retryRequest)).timeout(_timeout);
        final duration2 = DateTime.now().difference(startTime2).inMilliseconds;
        final decoded2 = retryResponse.body.isEmpty ? null : jsonDecode(retryResponse.body);

        if (kDebugMode) {
          debugPrint('API Retry Response: $method $_base$path ${retryResponse.statusCode} (${duration2}ms)');
        }

        if (retryResponse.statusCode >= 400) {
          throw ApiException(retryResponse.statusCode, _messageOf(decoded2), retryResponse.body);
        }
        return parse(decoded2);
      }
      // Refresh failed - clear auth state
      await _authStorage.clear();
      clearCachedToken();
      throw ApiException(response.statusCode, 'not_registered', response.body);
    }

    if (response.statusCode >= 400) {
      throw ApiException(response.statusCode, _messageOf(decoded), response.body);
    }
    return parse(decoded);
  }

  /// Attempt to refresh the access token using the refresh token.
  /// Returns true if refresh succeeded.
  Future<bool> _tryRefreshToken() async {
    try {
      final refreshToken = await _authStorage.getRefreshToken();
      if (refreshToken == null) return false;

      final response = await _client.post(
        Uri.parse('$_base/auth/refresh'),
        headers: {'content-type': 'application/json'},
        body: jsonEncode({'refreshToken': refreshToken}),
      ).timeout(_timeout);

      if (response.statusCode == 200) {
        final decoded = jsonDecode(response.body);
        final newAccessToken = decoded['accessToken'] as String?;
        final newRefreshToken = decoded['refreshToken'] as String?;
        if (newAccessToken != null && newRefreshToken != null) {
          await _authStorage.setAccessToken(newAccessToken);
          await _authStorage.getRefreshToken().then((old) async {
            if (old != null) {
              await _authStorage.setTokens(
                accessToken: newAccessToken,
                refreshToken: newRefreshToken,
                userId: (await _authStorage.getUserId()) ?? '',
              );
            }
          });
          _cachedAccessToken = newAccessToken;
          return true;
        }
      }
      return false;
    } catch (e) {
      if (kDebugMode) debugPrint('Token refresh failed: $e');
      return false;
    }
  }

  /// Decodes a JSON list into models using the caller's factory.
  Future<List<T>> listOf<T>(
    String path,
    T Function(Map<String, dynamic> json) fromJson, {
    Map<String, Object?>? query,
    String key = 'items',
  }) =>
      get<List<T>>(
        path,
        (json) {
          final raw = json is Map<String, dynamic> ? json[key] : json;
          return (raw as List<dynamic>? ?? const [])
              .map((e) => fromJson(e as Map<String, dynamic>))
              .toList(growable: false);
        },
        query: query,
      );


  /// NestJS puts the code in `message`, which is a string for a thrown
  /// HttpException and a list for a ValidationPipe failure.
  static String _messageOf(Object? body) {
    if (body is! Map) return 'error';
    final message = body['message'];
    if (message is String) return message;
    if (message is List && message.isNotEmpty) return message.first.toString();
    return body['error']?.toString() ?? 'error';
  }
}
