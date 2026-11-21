import 'dart:math';

/// Local storage stand-in for development. Returns *object paths* — the same
/// shape the backend stores in profiles.photos and validates
/// (`photos/{userId}/file.jpg`). A real cloud-storage client replaces upload()
/// later; the path contract stays identical.
abstract final class Storage {
  static Future<String> upload(String objectPath) async {
    // Dev stub: no bytes leave the device. Wire firebase_storage here when
    // bucket credentials exist; the returned path is already backend-valid.
    return objectPath;
  }

  /// Timestamped so a replacement never collides with the photo it replaces —
  /// the profile trigger compares paths to detect a primary-photo change.
  /// Lives under `photos/` — the backend rejects anything else.
  static String pathFor(String userId, String kind) =>
      'photos/$userId/$kind-${DateTime.now().millisecondsSinceEpoch}-${Random().nextInt(10000)}.jpg';
}
