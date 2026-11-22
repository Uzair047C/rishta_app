// ignore_for_file: avoid_web_libraries_in_flutter,unused_element
import 'package:flutter/foundation.dart';
import 'dart:js_interop';

/// Web-specific implementation - reads from JS global set in flutter_bootstrap.js.
/// Uses `dart:js_interop` (package:js is deprecated since Dart 3.3).
@JS('globalThis.rishtaGoogleClientId')
external JSString? get _rishtaGoogleClientId;

/// Implementation of the external function declared in google_signin_service.dart
Future<String?> _getGoogleClientId() async {
  if (!kIsWeb) return null;
  try {
    final JSString? js = _rishtaGoogleClientId;
    if (js == null) return null;
    return js.toDart;
  } catch (_) {
    return null;
  }
}
