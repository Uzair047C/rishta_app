import 'package:flutter/foundation.dart';
import 'package:firebase_messaging/firebase_messaging.dart';

/// FCM push registration: permission + token, POSTed to the backend at the
/// call sites (authed only). Platform string follows /notifications/device:
/// 'android' | 'ios' | 'web'.
Future<String?> registerPush() async {
  try {
    await FirebaseMessaging.instance.requestPermission();
    return await FirebaseMessaging.instance.getToken();
  } catch (e) {
    debugPrint('registerPush failed: $e');
    return null;
  }
}

/// Keeps the backend device row current when FCM rotates the token.
/// Fire-and-forget: failures only log, next refresh or re-login retries.
void listenForTokenRefresh(Future<void> Function(String token, String platform) post) {
  FirebaseMessaging.instance.onTokenRefresh.listen((token) async {
    try {
      await post(token, pushPlatform());
    } catch (e) {
      debugPrint('token refresh post failed: $e');
    }
  });
}

String pushPlatform() => kIsWeb
    ? 'web'
    : switch (defaultTargetPlatform) {
        TargetPlatform.android => 'android',
        TargetPlatform.iOS => 'ios',
        _ => 'web',
      };
