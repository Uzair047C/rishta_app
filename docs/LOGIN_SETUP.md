# Login Setup (Google Sign-In + Firebase)

All OAuth clients must live in **ONE Google Cloud project** so the ID tokens
share the same issuer and the backend can verify them against
`GOOGLE_CLIENT_IDS`.

## 1. Google Cloud Console (console.cloud.google.com)

Create three OAuth 2.0 client IDs under **APIs & Services → Credentials**:

| Client type | Used by | Notes |
|---|---|---|
| **Web application** | `serverClientId` (all platforms) + backend audience | Authorized JavaScript origins for any web builds |
| **Android** | `clientId` implicitly via `google-services.json` | Must register the **SHA-1** of your signing key (`./gradlew signingReport`, or the Play App Signing SHA-1) |
| **iOS** | `clientId` on iOS only (`GOOGLE_IOS_CLIENT_ID` dart-define) | Bundle ID must match the Xcode target |

Copy all three client IDs into `backend/.env`:

```
GOOGLE_CLIENT_IDS=<web-client-id>,<android-client-id>,<ios-client-id>
```

The backend (`POST /auth/google`) verifies the token's `aud` against this
comma-separated list and requires `email_verified`.

## 2. Android

- Download a **fresh** `google-services.json` **after** adding the SHA-1 — it
  must contain an `oauth_client` entry with the web client ID
  (`client_type: 3`), otherwise `serverClientId` verification fails.
- Place it in `app/android/app/`.

## 3. iOS

In `app/ios/Runner/Info.plist` (placeholders until you paste real values):

```xml
<key>GIDClientID</key>
<string>YOUR_IOS_CLIENT_ID.apps.googleusercontent.com</string>
<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleURLSchemes</key>
    <array>
      <!-- reversed client ID, e.g. com.googleusercontent.apps.<id>-<hash> -->
      <string>REVERSED_IOS_CLIENT_ID</string>
    </array>
  </dict>
</array>
```

Pass the iOS client ID at build time:
`flutter run --dart-define=GOOGLE_IOS_CLIENT_ID=<ios-client-id>`.

## 4. Flutter (mobile in general)

The **web client ID** is the `serverClientId` — the backend audience:

```
--dart-define=GOOGLE_SERVER_CLIENT_ID=<web-client-id>
```

On web it is read from `window.GOOGLE_SERVER_CLIENT_ID` in
`app/web/flutter_bootstrap.js` instead.

## 5. Firebase (email / phone sign-in)

Email and phone still go through Firebase Auth → `POST /auth/firebase`.
Configure the Firebase project (same Google Cloud project recommended):
enable Email/Password and Phone providers, then set
`FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`
(or `FIREBASE_SERVICE_ACCOUNT_BASE64`) in `backend/.env`.
