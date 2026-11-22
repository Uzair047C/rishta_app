import 'dart:io';

import 'package:flutter/services.dart';
import 'package:purchases_flutter/purchases_flutter.dart';

/// RevenueCat wrapper for the purchase flow (build step 7). Statics are
/// deliberate: the SDK is a singleton around one MethodChannel, and
/// configure() must run exactly once per app run.
///
/// The RevenueCat appUserID is always our backend user UUID — the server's
/// POST /subscription/webhook validates app_user_id as a UUID and looks the
/// user up by it.
class PurchasesService {
  PurchasesService._();

  /// True once the SDK is configured with real API keys. False in dev builds
  /// compiled without them — everything outside billing keeps working.
  static bool get available => _available;
  static bool _available = false;

  static Future<void>? _init;

  /// Configures the SDK once per app run against [userId]. Concurrent callers
  /// share the in-flight attempt; a failed attempt stays retryable.
  static Future<void> init(String userId) {
    return _init ??= _configure(userId).whenComplete(() {
      if (!_available) _init = null;
    });
  }

  static Future<void> _configure(String userId) async {
    const appleKey = String.fromEnvironment('REVENUECAT_APPLE_API_KEY');
    const googleKey = String.fromEnvironment('REVENUECAT_GOOGLE_API_KEY');
    final apiKey = Platform.isIOS ? appleKey : googleKey;
    if (apiKey.isEmpty) return; // dev build without keys: billing stays off

    await Purchases.setLogLevel(LogLevel.warn);
    await Purchases.configure(PurchasesConfiguration(apiKey)..appUserID = userId);
    _available = true;
  }

  static Future<Offerings> fetchOfferings() => Purchases.getOfferings();

  /// Completes a purchase. Returns false when the user cancelled the store
  /// dialog — that is not an error. Throws for everything else.
  static Future<bool> purchase(Package package) async {
    try {
      await Purchases.purchase(PurchaseParams.package(package));
      return true;
    } on PlatformException catch (e) {
      if (PurchasesErrorHelper.getErrorCode(e) ==
          PurchasesErrorCode.purchaseCancelledError) {
        return false;
      }
      rethrow;
    }
  }
}
