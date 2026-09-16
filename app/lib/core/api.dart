import 'dart:convert';

import 'package:http/http.dart' as http;

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

typedef TokenProvider = Future<String?> Function();

/// HTTP client for the Rishta API.
///
/// Generic over the decoded body: callers pass the parse function, so there is
/// one request path for every endpoint rather than a method per route.
class Api {
  Api({required TokenProvider token, http.Client? client, String? baseUrl})
      : _token = token,
        _client = client ?? http.Client(),
        _base = baseUrl ??
            const String.fromEnvironment('API_BASE', defaultValue: 'http://10.0.2.2:3000');

  final TokenProvider _token;
  final http.Client _client;
  final String _base;

  static const _timeout = Duration(seconds: 20);

  Future<T> get<T>(String path, T Function(Object? json) parse, {Map<String, Object?>? query}) =>
      request('GET', path, parse: parse, query: query);

  Future<T> post<T>(String path, {Object? body, T Function(Object? json)? parse}) =>
      request('POST', path, body: body, parse: parse ?? (json) => json as T);

  Future<T> put<T>(String path, {Object? body, T Function(Object? json)? parse}) =>
      request('PUT', path, body: body, parse: parse ?? (json) => json as T);

  Future<T> delete<T>(String path, {Object? body, T Function(Object? json)? parse}) =>
      request('DELETE', path, body: body, parse: parse ?? (json) => json as T);

  Future<T> request<T>(
    String method,
    String path, {
    required T Function(Object? json) parse,
    Object? body,
    Map<String, Object?>? query,
  }) async {
    final uri = Uri.parse('$_base$path').replace(
      queryParameters: query?.map((k, v) => MapEntry(k, v?.toString())),
    );

    final request = http.Request(method, uri)
      ..headers['content-type'] = 'application/json';

    final token = await _token();
    if (token != null) request.headers['authorization'] = 'Bearer $token';
    if (body != null) request.body = jsonEncode(body);

    final response = await http.Response.fromStream(await _client.send(request)).timeout(_timeout);
    final decoded = response.body.isEmpty ? null : jsonDecode(response.body);

    if (response.statusCode >= 400) {
      throw ApiException(response.statusCode, _messageOf(decoded), response.body);
    }
    return parse(decoded);
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
