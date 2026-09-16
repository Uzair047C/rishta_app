import 'dart:io';

import 'package:firebase_storage/firebase_storage.dart';

/// Uploads go straight from the device to Firebase Storage; the API only ever
/// sees the resulting URL. Keeping the bytes off the API server means photo
/// uploads do not pass through (or bottleneck on) the NestJS process.
abstract final class Storage {
  static Future<String> upload(String path, File file) async {
    final ref = FirebaseStorage.instance.ref(path);
    await ref.putFile(file);
    return ref.getDownloadURL();
  }

  /// Timestamped so a replacement never collides with the photo it replaces —
  /// the profile trigger compares URLs to detect a primary-photo change.
  static String pathFor(String userId, String kind) =>
      '$kind/$userId/${DateTime.now().millisecondsSinceEpoch}.jpg';
}
