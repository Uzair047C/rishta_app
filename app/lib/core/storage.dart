import 'dart:io';
import 'package:firebase_storage/firebase_storage.dart';

/// Firebase Storage implementation for production.
abstract final class Storage {
  static final FirebaseStorage _storage = FirebaseStorage.instance;

  /// Uploads a file to Firebase Storage and returns the download URL.
  static Future<String> upload(String path, File file) async {
    final ref = _storage.ref(path);
    final uploadTask = ref.putFile(file);
    final snapshot = await uploadTask.whenComplete(() {});
    return await snapshot.ref.getDownloadURL();
  }

  /// Timestamped so a replacement never collides with the photo it replaces —
  /// the profile trigger compares URLs to detect a primary-photo change.
  static String pathFor(String userId, String kind) =>
      '$kind/$userId/${DateTime.now().millisecondsSinceEpoch}.jpg';
}
