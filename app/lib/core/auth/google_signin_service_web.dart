// ignore_for_file: avoid_web_libraries_in_flutter
import 'package:flutter/foundation.dart';
import 'dart:js_interop';

/// Web-specific implementation — reads window.GOOGLE_SERVER_CLIENT_ID set in
/// flutter_bootstrap.js. Uses `dart:js_interop` (package:js is deprecated).
@JS('GOOGLE_SERVER_CLIENT_ID')
external JSString? get _googleServerClientId;

/// Implementation of the external function declared in google_signin_service.dart
Future<String?> getGoogleClientId() async {
  if (!kIsWeb) return null;
  try {
    final JSString? js = _googleServerClientId;
    return js?.toDart;
  } catch (_) {
    return null;
  }
}
