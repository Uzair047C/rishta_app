import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/foundation.dart';

import 'package:http/http.dart' as http;
import 'auth_storage.dart';
import 'config_provider.dart';

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
  targetNotVerified,
  unavailable,
  previouslyUnmatched,
  networkError,
  unknown;

  static ApiError parse(String? code) => switch (code) {
        'no_likes_remaining' => ApiError.noLikesRemaining,
        'subscription_inactive' => ApiError.subscriptionInactive,
        'under_min_age' => ApiError.underAge,
        'device_account_limit_reached' => ApiError.deviceLimitReached,
        'profile_incomplete' => ApiError.profileIncomplete,
        'not_registered' => ApiError.notRegistered,
        'blocked' => ApiError.blocked,
        'target_not_verified' => ApiError.targetNotVerified,
        'unavailable' => ApiError.unavailable,
        'previously_unmatched' => ApiError.previouslyUnmatched,
        'network_error' => ApiError.networkError,
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
        ApiError.targetNotVerified => 'This profile is not available. Please try another.',
        ApiError.unavailable => 'This profile is not available right now.',
        ApiError.previouslyUnmatched => 'You previously unmatched. A new match is not possible.',
        ApiError.networkError => 'Network error. Please check your connection and try again.',
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
       _base = baseUrl,
       _authStorage = authStorage ?? AuthStorage();

  final http.Client _client;
  final String? _base; // nullable initially, resolved on first request
  final AuthStorage _authStorage;

  static const _timeout = Duration(seconds: 20);

  /// Current access token (cached after first read).
  String? _cachedAccessToken;

  /// Completer for single-flight refresh: concurrent 401s share one refresh call.
  Completer<bool>? _refreshing;

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

  /// Resolves the base URL from platform config on first use.
  Future<String> _resolveBase() async {
    final base = _base;
    if (base != null) return base;
    final apiBase = await ConfigProvider.instance.getApiBase();
    // Enforce HTTPS for release builds (prod flavor)
    if (!kDebugMode && !apiBase.startsWith('https://')) {
      throw ApiException(0, 'insecure_api_base', 'Release builds require HTTPS API_BASE');
    }
    return apiBase;
  }

  /// Generates an idempotency key for mutating requests.
  String _generateIdempotencyKey() {
    // Simple UUID v4 without external dependency
    final random = DateTime.now().microsecondsSinceEpoch;
    final chars = '0123456789abcdef';
    return [
      for (var i = 0; i < 16; i++)
        i == 6 ? '4' : i == 8 ? '89ab'[random % 4] : chars[random % 16]
    ].join();
  }

  /// Single request path: handles timeouts, non-JSON bodies, error mapping, 401 retry, and idempotency.
  Future<T> request<T>(
    String method,
    String path, {
    required T Function(Object? json) parse,
    Object? body,
    Map<String, Object?>? query,
    bool requiresAuth = true,
    bool retried = false,
  }) async {
    final base = await _resolveBase();
    final uri = Uri.parse('$base$path').replace(
      queryParameters: query?.map((k, v) => MapEntry(k, v?.toString())),
    );

    final request = http.Request(method, uri)
      ..headers['content-type'] = 'application/json';

    // Add idempotency key for mutating requests (like, purchase)
    if (requiresAuth && (method == 'POST' || method == 'PUT' || method == 'PATCH')) {
      request.headers['idempotency-key'] = _generateIdempotencyKey();
    }

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
      debugPrint('API Request: $method $base$path');
      if (query?.isNotEmpty ?? false) debugPrint('  Query: $query');
      if (body != null) debugPrint('  Body: $body');
    }

    final startTime = DateTime.now();
    // Wrap send AND body read in the same timeout
    http.StreamedResponse streamedResponse;
    try {
      streamedResponse = await _client.send(request).timeout(_timeout);
    } on TimeoutException catch (_) {
      throw ApiException(0, 'network_error', 'Request timed out');
    } on SocketException catch (_) {
      throw ApiException(0, 'network_error', 'Network error');
    } on Exception catch (_) {
      throw ApiException(0, 'network_error', 'Network error');
    }

    http.Response response;
    try {
      response = await http.Response.fromStream(streamedResponse).timeout(_timeout);
    } on TimeoutException catch (_) {
      throw ApiException(0, 'network_error', 'Response timed out');
    } on SocketException catch (_) {
      throw ApiException(0, 'network_error', 'Network error');
    } on Exception catch (_) {
      throw ApiException(0, 'network_error', 'Network error');
    }

    final duration = DateTime.now().difference(startTime).inMilliseconds;

    Object? decoded;
    try {
      decoded = response.body.isEmpty ? null : jsonDecode(response.body);
    } on FormatException {
      throw ApiException(response.statusCode, 'invalid_json', 'Non-JSON response: ${response.body}');
    }

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
    if (response.statusCode == 401 && requiresAuth && !retried) {
      final refreshed = await _tryRefreshToken();
      if (refreshed) {
        // Retry the request with new token
        return await this.request<T>(method, path, parse: parse, body: body, query: query, requiresAuth: requiresAuth, retried: true);
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
  /// Uses single-flight: concurrent calls share one refresh operation.
  Future<bool> _tryRefreshToken() async {
    // Return existing refresh operation if in progress
    if (_refreshing != null) {
      return _refreshing!.future;
    }

    _refreshing = Completer<bool>();

    try {
      final refreshToken = await _authStorage.getRefreshToken();
      if (refreshToken == null) {
        _refreshing!.complete(false);
        return false;
      }

      final base = await _resolveBase();
      final response = await _client.post(
        Uri.parse('$base/auth/refresh'),
        headers: {'content-type': 'application/json'},
        body: jsonEncode({'refreshToken': refreshToken}),
      ).timeout(_timeout);

      if (response.statusCode == 200) {
        final decoded = jsonDecode(response.body);
        final newAccessToken = decoded['accessToken'] as String?;
        final newRefreshToken = decoded['refreshToken'] as String?;
        if (newAccessToken != null && newRefreshToken != null) {
          // Atomic token update
          await _authStorage.setTokens(
            accessToken: newAccessToken,
            refreshToken: newRefreshToken,
            userId: (await _authStorage.getUserId()) ?? '',
          );
          _cachedAccessToken = newAccessToken;
          _refreshing!.complete(true);
          return true;
        }
      }
      // Auth failure (401/400) - clear session
      if (response.statusCode == 401 || response.statusCode == 400) {
        await _authStorage.clear();
        clearCachedToken();
      }
      _refreshing!.complete(false);
      return false;
    } catch (e) {
      // Network/timeout errors - keep session, return false to signal retryable failure
      if (kDebugMode) debugPrint('Token refresh failed: $e');
      _refreshing!.complete(false);
      return false;
    } finally {
      // Clear completer after a tick to allow new refresh attempts
      Future.microtask(() => _refreshing = null);
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