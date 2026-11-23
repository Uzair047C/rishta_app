// flutter_bootstrap.js - Google Sign-In configuration for Flutter Web
// This file is loaded before Flutter initializes

(function() {
  window.flutterWebRenderer = 'canvaskit';

  // The Web OAuth client ID from Google Cloud Console — the backend verifies
  // the ID token against this audience (GOOGLE_CLIENT_IDS includes it).
  window.GOOGLE_SERVER_CLIENT_ID = '385499016700-h822cufamapr6ad2ujcj8d3t3hc8ec6o.apps.googleusercontent.com';

  window.flutterConfiguration = {};
})();
