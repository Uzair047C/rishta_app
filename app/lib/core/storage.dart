import 'dart:io';
import 'dart:typed_data';
import 'dart:math';
import 'dart:convert';

/// Simple local storage implementation for development.
/// In production, this should be replaced with a proper cloud storage solution.
abstract final class Storage {
  /// Base directory for uploads - in a real app, this would be configurable
  static const _uploadBase = 'uploads';

  static Future<String> upload(String path, File file) async {
    // For now, we'll simulate upload by returning a mock URL
    // In a real implementation, this would upload to actual storage
    final timestamp = DateTime.now().millisecondsSinceEpoch;
    final random = Random().nextInt(10000);
    final filename = '$path${path.endsWith('/') ? '' : '/'}$random-$timestamp-${file.path.split('/').last}';

    // Return a mock URL that follows the same format as Firebase Storage URLs
    return 'https://storage.googleapis.com/mock-bucket/$filename';
  }

  /// Timestamped so a replacement never collides with the photo it replaces —
  /// the profile trigger compares URLs to detect a primary-photo change.
  static String pathFor(String userId, String kind) =>
      '$kind/$userId/${DateTime.now().millisecondsSinceEpoch}.jpg';
}
