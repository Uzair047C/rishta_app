// ignore_for_file: avoid_web_libraries_in_flutter
// Web-specific implementation for Google Sign-In client ID retrieval

import 'package:js/js.dart';

@JS('GOOGLE_SERVER_CLIENT_ID')
external String? get googleServerClientId;

String? getGoogleClientIdWebJS() => googleServerClientId;