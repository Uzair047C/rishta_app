---
name: readme-md
description: Main project README.md file
metadata: 
  node_type: memory
  type: reference
  originSessionId: 76cd150f-5460-4657-bf66-63862a33f067
  modified: 2026-09-18T12:46:07.306Z
---

# rishta

Flutter + NestJS/PostgreSQL matchmaking app, built from [prompt.md](prompt.md).

```
backend/   NestJS API, PostgreSQL schema
app/       Flutter client (Riverpod)
```

---

## Backend

```bash
cd backend
npm install
cp .env.example .env          # fill in DATABASE_URL at minimum
npm run db:init               # applies sql/schema.sql then sql/seed.sql
npm run dev                   # nest start --watch on :3000
npm run typecheck             # tsc --noEmit
```

`GET /auth/health` is public and confirms the process is up without needing
Firebase credentials.

### Where the critical rules live

Spec §2.3 lists the rules that must not be bypassable. Most are DB-level, so a
future code path that forgets a rule still cannot break it:

| Rule | Enforced by |
|---|---|
| Minimum age 18 | `users_min_age` trigger — raises on any insert/update of `dob` |
| Verified phone unique | partial unique index `users_phone_verified_uniq` |
| Re-verify on primary photo change | `profiles_reverify_on_photo_change` trigger |
| No duplicate matches | normalized pair + `CHECK (user_a_id < user_b_id)` + unique index |
| Atomic like quota | application SQL — a live counter, so it stays a single `UPDATE ... WHERE likes_remaining_today > 0` with a rows-affected check |
| Quota resets nightly, never on login | `@Cron` in `SubscriptionService.nightlyQuotaReset` |
| Lapse gates new likes only | `FeedService.like` requires `status = 'active'`; `/matches` and chat read no subscription state at all |
| Feed excludes passes and blocks | `FeedService.feed` — `NOT EXISTS` on both tables, in both directions |

### Notable implementations

- **`Repo<T>`** (`src/db/db.ts`) — one generic table gateway for every table.
  Table and column names come from server-authored code, never a request body.
- **Stream tokens** (`src/auth/stream-token.ts`) — a 10-line HS256 JWT via
  `node:crypto` instead of pulling in `stream-chat`'s server SDK for one token.
- **Moderation** (`src/moderation/`) — flags for human review rather than
  hard-blocking, per §2.5. Both providers degrade to passthrough when their
  credentials are absent, so the pipeline is exercisable in development. In
  production an unconfigured verification provider refuses rather than
  auto-approving (`VerificationService.assertProvider`).

---

## App

```bash
cd app
flutter pub get
flutter run --dart-define=API_BASE=http://10.0.2.2:3000 \
            --dart-define=STREAM_API_KEY=your_stream_key
```

Requires `google-services.json` (Android) / `GoogleService-Info.plist` (iOS) for
Firebase. No generated `firebase_options.dart` is needed unless you target web
or macOS as well.

`10.0.2.2` is the Android emulator's alias for the host machine.

### Structure

- `lib/core/` — `theme.dart` (design tokens — the layer that mirrors to Figma),
  `api.dart` (one generic request path), `models.dart`, `providers.dart`,
  `widgets.dart` (`AsyncView` collapses loading/error/empty/data for every screen)
- `lib/features/` — one folder per area, one file per screen

---

## Deliberate deviations from the spec

1. **`profiles.name` added.** §1.2 lists Name as a profile-creation field; the
   §2.2 data model has no column for it. The endpoint would otherwise be unable
   to store a required field.
2. **`notification_preferences`, `device_tokens`, `moderation_flags` added.**
   §2.4 and §2.5 require the endpoints and the flagging pipeline, but §2.2 has
   no tables for them.
3. **`gender` and `dob` are nullable.** `POST /auth/verify-token` creates the
   users row before onboarding runs, so a `NOT NULL dob` would reject signup.
   A paired `CHECK` keeps the two consistent, and the age trigger still fires
   the moment `dob` is set.
4. **The feed also excludes already-liked profiles.** §2.3 names passes and
   blocks only, but an outgoing like is a swipe-past too, and §1.2 says a card
   the user already swiped should never re-render.
5. **`CANCELLATION` keeps status `active`.** A cancelled subscription has been
   paid through `renews_at`; marking it `cancelled` would revoke access the user
   already bought. The nightly job expires it once that date passes.
6. **Photo bytes never touch the API.** The client uploads straight to Firebase
   Storage and `POST /profile/photo` records the resulting URL.
7. **`flutter_svg` omitted** — the spec lists it under UI polish, but the app has
   no SVG assets. An unused dependency is worse than a missing one; add it when
   the first vector asset lands.

---

## Still open

- **Store billing.** `SubscriptionScreen._purchase` is a clearly-marked stub —
  RevenueCat/Play Billing is the remaining piece of build step 7. The server
  side it feeds (`POST /subscription/webhook`) is complete and authenticated.
- **Face Liveness client SDK.** The server implements the full
  `CreateFaceLivenessSession` → `GetFaceLivenessSessionResults` → `CompareFaces`
  flow. The app currently captures with the `camera` package and submits; swap in
  Amplify's `FaceLivenessDetector` against the returned `sessionId` for
  production-grade liveness.
- **Device fingerprint.** `users.device_id` and the per-device account cap are
  implemented; the client does not yet send one. Firebase App Check is the
  intended source (§2.3).