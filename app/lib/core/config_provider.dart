import 'dart:async';
import 'dart:io' show Platform;
import 'package:flutter/services.dart';

/// Platform-specific config provider for API_BASE and other build-time config.
class ConfigProvider {
  ConfigProvider._();
  static final instance = ConfigProvider._();

  static const _channel = MethodChannel('com.example.rishta/config');

  String? _cachedApiBase;

  /// Gets the API base URL from native configuration.
  Future<String> getApiBase() async {
    if (_cachedApiBase != null) return _cachedApiBase!;

    try {
      final apiBase = await _channel.invokeMethod<String>('getApiBase');
      if (apiBase != null && apiBase.isNotEmpty) {
        _cachedApiBase = apiBase;
        return apiBase;
      }
    } on PlatformException {
      // Platform channel not available, fall back to defaults
    }

    // Fallback defaults per platform
    if (Platform.isAndroid) {
      // 10.0.2.2 is the Android emulator's alias for host localhost
      _cachedApiBase = 'http://10.0.2.2:3000';
    } else if (Platform.isIOS) {
      _cachedApiBase = 'http://localhost:3000';
    } else {
      // Web, desktop, etc.
      _cachedApiBase = 'http://localhost:3000';
    }
    return _cachedApiBase!;
  }

  /// Clears the cache (useful for tests or config changes).
  void clearCache() {
    _cachedApiBase = null;
  }
}