// ignore_for_file: avoid_web_libraries_in_flutter,unused_element
import 'package:flutter/foundation.dart';
import 'package:js/js.dart';

/// Web-specific implementation - reads from JS global set in flutter_bootstrap.js.
/// Uses `package:js` which is only available when compiling for web.
@JS('globalThis.rishtaGoogleClientId')
external String? get _rishtaGoogleClientId;

/// Implementation of the external function declared in google_signin_service.dart
Future<String?> _getGoogleClientId() async {
  if (!kIsWeb) return null;
  try {
    return _rishtaGoogleClientId;
  } catch (_) {
    return null;
  }
}