import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

/// Platform-specific config provider for API_BASE and other build-time config.
class ConfigProvider {
  ConfigProvider._();
  static final instance = ConfigProvider._();

  static const _channel = MethodChannel('com.example.rishta/config');

  String? _cachedApiBase;

  /// Gets the API base URL.
  /// Priority: --dart-define=API_BASE > native platform channel > platform defaults
  Future<String> getApiBase() async {
    if (_cachedApiBase != null) return _cachedApiBase!;

    // 1. Check --dart-define first (works on all platforms)
    const dartDefineApiBase = String.fromEnvironment('API_BASE');
    if (dartDefineApiBase.isNotEmpty) {
      _cachedApiBase = dartDefineApiBase;
      return _cachedApiBase!;
    }

    // 2. Try native platform channel
    try {
      final apiBase = await _channel.invokeMethod<String>('getApiBase');
      if (apiBase != null && apiBase.isNotEmpty) {
        _cachedApiBase = apiBase;
        return _cachedApiBase!;
      }
    } on PlatformException catch (_) {
      // Platform channel not available, fall back to defaults
    } on MissingPluginException catch (_) {
      // Plugin not registered (e.g., web without proper setup), fall back
    }

    // 3. Fallback defaults per platform (using kIsWeb/defaultTargetPlatform)
    if (kIsWeb) {
      _cachedApiBase = 'http://localhost:3000';
    } else if (defaultTargetPlatform == TargetPlatform.android) {
      // 10.0.2.2 is the Android emulator's alias for host localhost
      _cachedApiBase = 'http://10.0.2.2:3000';
    } else if (defaultTargetPlatform == TargetPlatform.iOS) {
      _cachedApiBase = 'http://localhost:3000';
    } else {
      // Desktop, etc.
      _cachedApiBase = 'http://localhost:3000';
    }

    // 4. Enforce HTTPS for release builds
    if (!kDebugMode && !_cachedApiBase!.startsWith('https://')) {
      throw StateError('Release builds require HTTPS API_BASE. Current: $_cachedApiBase');
    }

    return _cachedApiBase!;
  }

  /// Clears the cache (useful for tests or config changes).
  void clearCache() {
    _cachedApiBase = null;
  }
}