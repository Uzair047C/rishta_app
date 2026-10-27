// flutter_bootstrap.js - Google Sign-In configuration for Flutter Web
// This file is loaded before Flutter initializes

(function() {
  // Google Sign-In client ID for web
  // Replace with your actual Web Client ID from Google Cloud Console
  // Format: 123456789-abcdefghijklmnopqrstuvwxyz.apps.googleusercontent.com

  window.flutterWebRenderer = 'canvaskit';

  // Set the Google Client ID as a global variable that can be read by Dart
  window.GOOGLE_SERVER_CLIENT_ID = '385499016700-h822cufamapr6ad2ujcj8d3t3hc8ec6o.apps.googleusercontent.com';

  // Configure the Flutter loader
  window.flutterConfiguration = {
    // Optional: set a custom base href if not serving from root
    // baseHref: '/your-app-path/',

    // Optional: enable service worker for offline support
    // serviceWorker: {
    //   serviceWorkerUrl: 'flutter_service_worker.js'
    // }
  };
})();