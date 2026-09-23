---
name: flutter-windows-fix-firebase-options
description: Added dummy FirebaseOptions to allow Flutter Windows build to pass compilation.
metadata:
  type: project
---

In lib/main.dart, added a constant `firebaseOptions` with dummy values to satisfy the `Firebase.initializeApp(options: ...)` call when `kIsWeb` is false (Windows). This fixed the "Undefined name 'firebaseOptions'" compile error. The app now builds and runs, but Firebase initialization fails at runtime because the options are dummy; a proper firebase_options.dart (generated via `flutterfire configure`) is needed for full Firebase functionality on Windows.

**Why:** The original code referenced `firebaseOptions` only in the web branch, leaving it undefined for desktop platforms, causing a compile-time error.

**How to apply:** Replace the dummy constant with real Firebase options for Windows (or keep dummy if Firebase features are not needed) and ensure `Firebase.initializeApp` receives appropriate options for the platform.