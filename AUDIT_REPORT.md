# Rishta Repository Audit

## 1. Project map

- **[app/](app/)** — Flutter app. State management is Riverpod (`flutter_riverpod`). Routing is a root `AuthWrapper` switch plus `MaterialPageRoute`; there is no `GoRouter`. The app uses a shared HTTP client in [api.dart](app/lib/core/api.dart) and stores auth tokens with `flutter_secure_storage` in [auth_storage.dart](app/lib/core/auth_storage.dart).
- **[backend/](backend/)** — NestJS REST API backed by PostgreSQL; migrations and seed data are in [backend/sql/](backend/sql/). Auth verifies Google ID tokens and issues app JWTs; Firebase authentication has since been removed. Other integrations include Stream Chat, RevenueCat webhooks, AWS Rekognition, and pg-boss jobs.
- Direct Flutter dependencies in [pubspec.yaml](app/pubspec.yaml): Riverpod, Google Sign-In, secure storage, Stream Chat, camera, image picker, geolocator, `http`, `intl`, cached images, Google Fonts, and animations.
- CI is in [ci.yml](.github/workflows/ci.yml). The app has one smoke test; the backend has unit and e2e test files.

## 2. Findings

### Security-review summary

| # | Severity | File | Lines | Vulnerability | Confidence |
|---|----------|------|-------|---------------|------------|
| 1 | 🟠 HIGH | [jwt-auth.guard.ts](backend/src/auth/jwt-auth.guard.ts#L68), [auth.service.ts](backend/src/auth/auth.service.ts#L59), [admin.controller.ts](backend/src/moderation/admin.controller.ts#L157) | 68, 59, 157 | Suspended/banned users remain authorized: the JWT guard does not reject inactive users; Google login can issue them fresh tokens. Admin status changes do not revoke access tokens. | 10/10 |
| 2 | 🟠 HIGH | [package-lock.json](backend/package-lock.json#L4694), [main.ts](backend/src/main.ts#L90) | 4694, 90 | `body-parser` 2.3.0 is in the affected range for GHSA-27r3-jxmh-p828 (DoS via compressed request bodies) and is used by the global JSON parser. `100kb` limit is configured, but the dependency remains vulnerable. | 8/10 |
| 3 | ⚪ LOW | Historical `backend/.env` (added in commit `e8ec5b5f`, removed in `206cc994`) | 2 | A local-development database default was committed. The security review found no non-placeholder production/service secrets in that historical file. It is not a production credential unless reused elsewhere. | 9/10 |

The `npm audit --omit=dev` report lists 13 vulnerable package entries. The security review found the critical `proxy-addr` advisory’s required trust-subnet configuration is not present; Multer and several other flagged dependencies lack an applicable request path or are DoS-only. The Android [google-services.json](app/android/app/google-services.json#L16) contains a Firebase client API key, which is public app configuration rather than a private service credential; its Google Cloud restrictions cannot be checked from this repo.

| ID | Severity | Category | File:Line | Problem | Evidence snippet | Why it matters | Suggested fix |
|---|---|---|---|---|---|---|---|
| F1 | 🟠 HIGH (resolved) | Authentication | [auth_providers.dart:119](app/lib/core/auth_providers.dart#L119), [auth.controller.ts](backend/src/auth/auth.controller.ts), [auth.service.ts](backend/src/auth/auth.service.ts) | **Resolved 2026-11-14:** the backend now exposes `/auth/google`, verifies Google ID tokens against configured audiences, and issues the app session. | `@Post('google')`; `OAuth2Client.verifyIdToken(...)` | Before the fix, Google login failed at the backend route/token boundary. | Implemented Google verification and retained Firebase-auth-free Google login as the supported flow. |
| F2 | 🟠 HIGH | Onboarding | [onboarding_flow.dart:36](app/lib/features/onboarding/onboarding_flow.dart#L36), [onboarding_flow.dart:207](app/lib/features/onboarding/onboarding_flow.dart#L207), [users.service.ts:25](backend/src/users/users.service.ts#L25), [users.service.ts:33](backend/src/users/users.service.ts#L33) | The client flow has no writes for required `name`, `gender`, or `dob`, but marks onboarding complete locally. The backend requires all of them (and photos) before protected operations. I searched the Dart sources for writes to these fields. | `setProfileComplete()`; backend checks `name IS NOT NULL` and `!user.gender || !user.dob` | New accounts can reach the home UI while the backend still rejects profile-dependent requests as incomplete. | Add the required steps and have the server determine completion; do not mark complete solely in client state. |
| F3 | 🟠 HIGH | Onboarding/API contract | [onboarding_flow.dart:97](app/lib/features/onboarding/onboarding_flow.dart#L97), [profile.controller.ts:45](backend/src/profile/profile.controller.ts#L45), [main.ts:147](backend/src/main.ts#L147) | Several onboarding saves use snake_case keys, while the DTO accepts camelCase. The global validation pipe rejects non-whitelisted fields. Interests also use `interests` on the client while the DTO expects `interestIds`. | `'religious_practice_level'` vs `religiousPracticeLevel`; `forbidNonWhitelisted: true` | Those save steps return validation errors instead of persisting the selected values. | Make the API payload and DTO naming consistent, including arrays and booleans. |
| F4 | 🟠 HIGH | Photo upload | [storage.dart:15](app/lib/core/storage.dart#L15), [providers.dart:72](app/lib/core/providers.dart#L72), [profile.controller.ts:59](backend/src/profile/profile.controller.ts#L59), [photos.service.ts:152](backend/src/photos/photos.service.ts#L152) | Photo upload is a stub and its client/server contract is incompatible. The client returns a mock URL, posts it as `url`, and uses a `profiles/` path; the server requires `objectPath` under `photos/{userId}/`. | `mock-bucket`; `{'url': url}`; `objectPath!`; prefix `photos/${userId}/` | The required photo step cannot successfully register photos; no real photo bytes are uploaded. | Implement real storage upload and pass the server’s validated object path. |
| F5 | 🟠 HIGH | Authorization | [jwt-auth.guard.ts:68](backend/src/auth/jwt-auth.guard.ts#L68), [jwt-auth.guard.ts:75](backend/src/auth/jwt-auth.guard.ts#L75), [admin.controller.ts:157](backend/src/moderation/admin.controller.ts#L157) | The JWT guard verifies the token and checks that the user exists, but does not check `user.status`. Google login also issues tokens for existing inactive users. | Guard attaches the user and returns `true`; status update only writes `users.status` | Banning a user does not prevent continued API access; a user with a valid Google token can obtain fresh API tokens. | Reject inactive users in the global guard and login flow; revoke refresh tokens when status changes; apply the same check to admin access. |
| F6 | 🟠 HIGH | CI/build | [ci.yml:11](.github/workflows/ci.yml#L11), [pubspec.yaml:7](app/pubspec.yaml#L7) | CI pins Flutter 3.24.3, which bundles Dart 3.5.x, while the app requires Dart `^3.6.0`. | `FLUTTER_VERSION: '3.24.3'`; `sdk: ^3.6.0` | CI dependency resolution cannot satisfy the declared SDK constraint. | Pin a Flutter release whose bundled Dart is at least 3.6. |
| F7 | 🟠 HIGH | Release signing | [build.gradle.kts:51](app/android/app/build.gradle.kts#L51) | Android release builds use the debug signing configuration. | `signingConfig = signingConfigs.getByName("debug")` | This is not a production release-signing setup and prevents a proper store release/update process. | Configure a protected production keystore and release signing. |
| F8 | 🟠 HIGH | Verification | [selfie_screen.dart:91](app/lib/features/onboarding/selfie_screen.dart#L91), [verification.controller.ts:24](backend/src/verification/verification.controller.ts#L24), [feed.service.ts:232](backend/src/feed/feed.service.ts#L232) | The selfie screen adds a profile photo but never calls `/verification/selfie`. I searched the app source for verification API calls. The feed only includes verified profiles. | `Add as a profile photo (not verification)`; feed requires `p.verification_status = 'verified'` | New users are not submitted for verification, so their profiles remain excluded from the feed unless verified through some external process. | Submit the captured selfie to the verification endpoint and surface pending/failure status. |
| F9 | 🟡 MEDIUM | Feed pagination | [providers.dart:185](app/lib/core/providers.dart#L185), [feed.controller.ts:19](backend/src/feed/feed.controller.ts#L19), [feed.controller.ts:44](backend/src/feed/feed.controller.ts#L44) | The client flattens cursor fields into query parameters instead of sending the backend’s opaque `cursor` string; it also ignores `nextCursor`. | `...cursorQuery`; backend expects `cursor?: string` | Loading more sends unrecognized fields; with whitelist validation enabled, pagination requests fail. | Pass the server-provided `nextCursor` as the `cursor` query parameter. |
| F10 | 🟡 MEDIUM | Account deletion/privacy | [account.controller.ts:173](backend/src/account/account.controller.ts#L173), [account.controller.ts:182](backend/src/account/account.controller.ts#L182) | Account deletion does not delete photos from object storage but reports that photos were removed. | `TODO: Implement actual storage deletion`; response says photos “have been removed” | If real storage is configured, personal photos can remain after account deletion. | Delete the storage objects before reporting successful deletion; return an explicit failure if cleanup fails. |
| F11 | 🟡 MEDIUM | Session handling | [auth_providers.dart:97](app/lib/core/auth_providers.dart#L97), [auth_providers.dart:99](app/lib/core/auth_providers.dart#L99) | Session restoration clears all saved credentials for any exception, including transient network failures. | `catch (e) { ... await _authStorage.clear(); }` | A temporary API outage can force a valid user to sign in again. | Clear credentials only for confirmed invalid/expired sessions; preserve them on network errors. |
| F12 | 🟡 MEDIUM | Notifications | [push.service.ts:44](backend/src/notifications/push.service.ts#L44), [push.service.ts:46](backend/src/notifications/push.service.ts#L46) | Push notifications are simulated; no notification is sent. | `Push notification simulated` | Likes, matches, and messages will not generate actual push notifications in production. | Integrate a delivery provider and handle invalid-token responses. |
| F13 | 🟡 MEDIUM | Billing | [subscription_screen.dart:66](app/lib/features/subscription/subscription_screen.dart#L66), [subscription_screen.dart:83](app/lib/features/subscription/subscription_screen.dart#L83) | “Choose” only displays a “not wired up yet” snackbar; no purchase flow exists. | `Billing for "$productId" is not wired up yet.` | Users cannot buy the displayed plans. | Implement store billing and verify purchases server-side before enabling the plans. |
| F14 | 🟡 MEDIUM | Web login | [google_signin_service.dart:12](app/lib/core/google_signin_service.dart#L12), [google_signin_service.dart:89](app/lib/core/google_signin_service.dart#L89), [main.dart:19](app/lib/main.dart#L19) | Web initialization always gets a null Google client ID and throws before `runApp`. | `_getGoogleClientIdWeb() => null` | If web is a supported target, the app cannot start there. | Implement web client-ID loading or explicitly remove/disable web support. |
| F15 | ⚪ LOW | Documentation/config | [README.md:88](README.md#L88), [config_provider.dart:19](app/lib/core/config_provider.dart#L19), [build.gradle.kts:38](app/android/app/build.gradle.kts#L38) | The README’s `--dart-define=API_BASE=...` is not read by the app; Android obtains a hardcoded flavor value through a method channel. | README passes `API_BASE`; Android uses `BuildConfig.API_BASE` | Custom API URLs supplied as documented are ignored. The default emulator URL happens to match. | Read the define or document the actual flavor/configuration mechanism. |
| F16 | ⚪ LOW | Tests | [auth.service.spec.ts:225](backend/src/auth/auth.service.spec.ts#L225), [auth.service.ts:187](backend/src/auth/auth.service.ts#L187) | One backend test fails because its mocked valid rotation result omits the `user_status: 'active'` field now required by the service. | Test mock returns no `user_status`; service rejects it as inactive | The backend test suite is red and does not validate the current success response shape. | Update the fixture and retain a regression test for successful token rotation. |

## 3. Looks fine

- Auth tokens use `flutter_secure_storage`; the API implements a 401 refresh attempt, and the backend rotates hashed refresh tokens.
- Release API requests enforce HTTPS in the client.
- The backend has global JWT guarding, explicit production CORS configuration, input validation, and request timeouts.
- The feed and profile queries inspected use parameterized SQL.
- Inspected UI paths include loading/error states; the feed scroll controller is disposed.
- No private Firebase service-account key or non-placeholder production secret was identified in the tracked files/history reviewed.

## 4. Unverified / needs human confirmation

- The current local [backend/.env](backend/.env) is ignored and was not inspected. The historical tracked `.env` had a local database default and blank secret fields; do not reuse that default on a reachable system.
- Verify API-key restrictions for [google-services.json](app/android/app/google-services.json#L16) in Google Cloud/Firebase; repository contents cannot show those console settings.
- Verify production storage bucket permissions, Firebase/Stream/RevenueCat settings, deployed TLS, and the runtime `TRUST_PROXY` value.
- Password reset/password login was not found in the repository. If these are product requirements rather than Google-only authentication, they are unimplemented.
- `flutter pub outdated` reports many newer versions and discontinued transitive packages, but it does not identify CVEs. The npm audit’s other advisories were not confirmed as exploitable paths in the reviewed application code.

## 5. Top 10 fix order

1. Enforce active-user status in JWT guard, login, and admin access; revoke refresh tokens on suspension/ban.
2. Upgrade `body-parser` beyond the affected range and verify the compressed-body DoS path is closed.
3. Align Google Sign-In/Firebase token exchange and the `/auth` route.
4. Implement real photo upload and the expected `objectPath` contract.
5. Collect required profile name, gender, and date of birth; have the server confirm completion.
6. Align onboarding payload keys with the profile DTO.
7. Replace Android debug release signing with production signing.
8. Update the CI Flutter pin to satisfy Dart `^3.6.0`.
9. Submit selfies to the verification endpoint.
10. Fix feed cursor handling and account-photo deletion before launch.

## 6. Coverage report

Reviewed the project structure and key authentication, API, onboarding, photo, feed, verification, billing, and backend configuration paths. I did **not** inspect every screen or backend module line by line. In particular, the remaining individual onboarding screens, reports/matches/notification controllers, most SQL migrations, generated/build artifacts, full Android/iOS manifests, and external provider dashboards were not fully reviewed. `node_modules`, Flutter build output, and `.dart_tool` were excluded.

## Validation

- `flutter analyze` and `dart analyze` both reported no issues.
- `flutter test` passed its one smoke test.
- `npm run typecheck` passed.
- `npm test -- --runInBand` reported 6 suites passed and 1 failed (103 passed, 1 failed).
- `flutter pub outdated` found 101 packages with newer versions available.
- `npm audit --omit=dev` reported 13 vulnerable package entries.

**No code was changed during the audit.**
