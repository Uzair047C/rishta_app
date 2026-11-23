You are a senior full-stack engineer working on the repo Uzair047C/rishta_app
(Flutter client in /app, NestJS + PostgreSQL backend in /backend).
Work on a new branch `fix/login-and-review`. Make small commits, one per task.
After each task run: `cd backend && npm run typecheck && npm test` and
`cd app && flutter analyze && flutter test`. Do not print or commit any secret values.
If a task is unclear or risky, stop and ask me before continuing.

## PHASE 1: Login (do this first)

Problem: sign-in cannot work today. The app sends a Google ID token to
`/auth/google`, but the backend only has `/auth/firebase` and verifies Firebase
tokens. The app has no firebase_auth package. The Google project IDs also don't match.

1. Backend: add `POST /auth/google` (@Public, throttled 10/min) that takes
   `{ idToken: string }` using a real DTO class with class-validator.
   Verify it with `OAuth2Client.verifyIdToken` from `google-auth-library`
   (already installed), with `audience` = comma-separated `GOOGLE_CLIENT_IDS`.
   Require `email_verified`. Reuse the existing find-or-create user logic keyed on
   the Google `sub`, then `issueTokenPair`. Keep `/auth/firebase` working.
   Return the same shape as `firebaseLogin`.
2. Backend: in both login paths and in `JwtAuthGuard`, reject users whose
   `status` is not 'active' (suspended or banned). The guard's status cache is
   useless: it queries `SELECT *` every request anyway. Remove the cache, or make it
   cache the whole user. Also make the admin "set user status" endpoint revoke that
   user's refresh tokens.
3. Backend: use proper DTOs for `refresh` and `logout`. A missing `refreshToken`
   must return 400, not 500. Scope logout-by-token to the calling user.
4. Flutter: fix `GoogleSignInService`: one cached `GoogleSignIn` instance (not a
   getter), correct `clientId` (iOS client ID on iOS only), `serverClientId` = web
   client ID, and read the web client ID from `window.GOOGLE_SERVER_CLIENT_ID`
   with `dart:js_interop`. `initialize()` must not throw and crash `main()`.
   Call `GoogleSignInService.signOut()` in `AuthNotifier.signOut`.
5. Flutter: `LoginScreen` must show `authState.error`. Currently `AuthWrapper`
   replaces the screen with a loader during `authenticating`, which destroys the
   local `_error`. Show the error as a banner/snackbar driven by the provider.
6. Flutter: do not clear tokens on network errors. In `AuthNotifier._restoreSession`
   and the 401 branch of `Api.request`, clear the session only on a real 401/400
   from the server. Offline launch should stay signed in.
7. Flutter: add Terms/Privacy as tappable links and an 18+ confirmation checkbox
   before the Google button is enabled. Send consent and timestamp to the backend
   and store it (new migration `0015`).
8. Config for login: add `GOOGLE_CLIENT_IDS` to the Joi schema in
   `backend/src/config/validation.ts` and fix `.env.example` (see Phase 2).
   Add a short `docs/LOGIN_SETUP.md` explaining: create Web/Android/iOS OAuth
   clients in ONE Google Cloud project; Android needs SHA-1 registered and a fresh
   google-services.json containing an oauth_client; iOS needs `GIDClientID` and
   the reversed client ID URL scheme in Info.plist.

## PHASE 2: Build and config

9. `app/android/app/build.gradle.kts`: the `implementation(...)` line is inside the
   `plugins {}` block, so move it to `dependencies {}`. Enable
   `buildFeatures { buildConfig = true }`. Add a real release signing config read from
   `key.properties` (gitignored). Replace the `com.example.rishta` app ID with a
   placeholder and a TODO.
10. `AndroidManifest.xml`: add INTERNET, CAMERA, ACCESS_COARSE_LOCATION and
    ACCESS_FINE_LOCATION permissions, and `android:allowBackup="false"`.
11. iOS `Info.plist`: add NSCameraUsageDescription,
    NSLocationWhenInUseUsageDescription, NSPhotoLibraryUsageDescription, GIDClientID
    and the reversed-client-ID URL scheme (use placeholders).
12. `pubspec.yaml` declares `assets/` but the folder doesn't exist. Create it
    (with the Google logo placeholder) or remove the entry.
13. CI: build with `--flavor dev` (or add a default flavor) so `build-android` and
    `build-ios` pass. Use a PostGIS image (`postgis/postgis:16-3.4`) for the
    backend job.
14. `backend/.env.example`: rename `CORS_ORIGIN` to `CORS_ORIGINS`, add
    `FIREBASE_*`, `GOOGLE_CLIENT_IDS`, `ADMIN_USER_IDS`, `STORAGE_BUCKET_HOST`,
    `STORAGE_BUCKET_NAME`, `FACE_VERIFICATION_PROVIDER`,
    `REKOGNITION_SIMILARITY_THRESHOLD` (fix the wrong name), `REDIS_URL`. Remove
    stale comments. Make config actually use `JWT_ACCESS_TTL_MINUTES`,
    `JWT_REFRESH_TTL_DAYS` and `THROTTLE_DEFAULT_*`. Remove the placeholder default
    `storage.example.com`: require `STORAGE_BUCKET_HOST` in production. Make the
    Firebase, Stream and RevenueCat variables optional in `development` and `test`.
15. Fix the README: remove `--dart-define=API_BASE`, document the flavors, and
    say that web is unsupported until fixed (or make `ConfigProvider` web-safe by
    using `String.fromEnvironment('API_BASE')` and `kIsWeb`).

## PHASE 3: Security and bugs from my code review

16. SECRETS: do NOT touch git history yourself. Write
    `docs/ROTATE_SECRETS.md` with exact steps (rotate Firebase key, Stream secret,
    JWT secret, DB password, then purge `.env` with git filter-repo), and tick
    nothing off. Remove committed junk: ~45 `backend/test-*.js` files,
    `.gitignore.backup`, `.playwright-mcp/`, and the root `package-lock.json`.
    Remove unused deps (`bcrypt`, `@types/bcrypt`, `@types/helmet`, `@types/joi`).
17. Location privacy: stop exposing exact distance. Sign the pagination cursor
    (HMAC) and never put `distance_m` in it (use a rank or an opaque offset). Limit
    how often a user can change lat/lng and cap `radiusKm` at 500 everywhere (the
    controller allows 20000, the service allows 500).
18. Photos: reject `..`, `//` and absolute paths in `validateObjectPath`. Verify the
    object exists in storage. Make `PhotosService` and `profile_photos` the ONE source
    of truth (delete the dead `ProfileService.addPhoto/setPhotos`; update the feed and
    `requireOnboarded` to read the same table). Make the selfie URL for
    `/verification/selfie` restricted to `selfies/{userId}/` and different from the
    primary photo.
19. Feed pagination: fix the cursor query when `distance_m` is null (use COALESCE
    on the cursor value too). Make the Flutter client send the server's `nextCursor`
    string as `cursor`, append pages instead of replacing, and fix the inverted
    `loadMore` condition. Rename the client's `distanceKm` to `distance_bucket`.
20. Outbox: make the `outbox.process` cron worker call `processBatch()`. Do not
    call it from inside the transaction. Trigger it after commit. Do not hold a DB
    transaction open during the push call.
21. RevenueCat webhook: return 401 for a bad secret and 500 for DB errors so
    RevenueCat retries. Only return 200 for handled or ignored events. Fix lapsed
    subscriptions: expired paid users fall back to the free plan with status 'active'.
22. Account deletion: keep reports filed against the user (anonymize them
    instead of deleting), delete the Stream user and the stored photos, and fix the
    response text so it only claims what actually happened.
23. Rate limiting: make sure throttling is keyed by user id (register
    `JwtAuthGuard` before `ThrottlerGuard`, or use a custom tracker), and warn at
    startup if `REDIS_URL` is missing in production.
24. Stream chat: create channels server-side only (members = the two matched users),
    freeze or delete the channel on unmatch and block, use a token provider so
    the 1-hour token refreshes, and add message moderation.
25. Flutter: fix the weak idempotency key (use `Random.secure()` + a real UUID v4)
    and make the backend honor `Idempotency-Key` for `/feed/like` using the
    existing `idempotency_keys` table. Fix the photo upload payload (`objectPath`,
    not `url`).
26. Cleanups: `Promise.all` on a single transaction client in `assertCanInteract`
    should be sequential; the `Repo` allowlist must be required; `/auth/me` must not
    swallow errors; unify admin checks (`ADMIN_USER_IDS` and `is_admin`) in one
    guard; validate admin `limit` as a number.

## Rules
- Add or update tests for every backend change (auth, feed cursor, webhook, outbox).
- Do not change public API shapes without updating the Flutter client in the same PR.
- At the end, output a table: task number, status (done / skipped / needs my input),
  files changed, and anything I must do manually (console settings, key rotation,
  Apple sign-in, phone OTP).