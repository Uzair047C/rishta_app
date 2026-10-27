# Rishta Matchmaking App — Finalized Frontend & Backend Build Spec

This is a build-ready spec for a Flutter frontend + NestJS/PostgreSQL backend,
incorporating fixes for the concurrency, security, and app-store-compliance gaps
found in the original draft. Product/business/legal considerations are intentionally
out of scope here — this is implementation-focused.

---

## 1. Frontend (Flutter) — Screens, State, and Client-Side Rules

### 1.1 Stack
- **Framework**: Flutter (Android, iOS-ready, Flutter Web for the logged-in app experience)
- **State management**: Riverpod
- **Marketing/landing pages**: build separately as plain HTML or Next.js, not Flutter Web —
  Flutter Web renders via canvas, not semantic HTML, so it has weak SEO. Reserve Flutter
  Web for the authenticated in-app experience only.
- **UI polish**: Material 3 theming, `google_fonts`, `flutter_animate`, `flutter_svg`,
  `cached_network_image`

### 1.2 Screens & Client-Side Logic

**Auth**
- Email/password + Google Sign-In via Firebase Auth (implement Google first — same SDK)
- Phone number OTP verification (Firebase Auth or Twilio Verify) — required, not optional,
  before a profile can go live (see backend duplicate-account rules in §2.5)
- Age gate: DOB picker only — never a free-text/self-reported age field. Client-side reject
  DOB values that compute to under 18, in addition to backend enforcement.

**Profile Creation**
- Name, DOB (→ computed age), gender, location (city + GPS permission for radius filtering)
- Bio (free text, sent to backend moderation on save — see §2.6)
- Interests: multi-select from a **fixed, backend-provided tag list** — no free-text
  interest entry, this is what makes tag-overlap matching computable
- Languages: multi-select, fixed list
- Education, profession (optional fields)
- Marital status (never married / divorced / widowed) — standard field for this category,
  include at MVP
- Photos: minimum 1, recommend 3–6, uploaded to Firebase Storage/S3
- Live selfie capture: **in-app camera only, no gallery picker for this specific step** —
  enforce this at the widget level, don't just rely on a UI convention

**Selfie Verification Flow**
- Runs as its own gating step in onboarding, before browsing is unlocked (build this early
  in the MVP sequence, not last)
- Show clear pending/verified/failed states — unverified accounts should see a "verification
  pending" screen instead of the browsing feed
- **Re-verification trigger**: if a user changes their primary profile photo post-signup,
  the client must call the re-verification endpoint and show the same pending state again
  until it resolves — don't let a photo change silently bypass verification

**Browsing Feed**
- Shows opposite-gender profiles only
- Filters: location radius, age range
- Ranked by interest-tag overlap score (backend-computed, frontend just renders order)
- **Exclude both passed and blocked profiles from the feed** — this depends on the backend
  passes/blocks tables (§2.5); frontend should never re-render a card the user already
  swiped past or blocked
- Each card needs three actions: Like, Pass, Block/Report (not just Like/Pass)

**Likes & Subscription UI**
- Show remaining daily likes count prominently, always visible while browsing
- Disable the Like action with a clear "come back tomorrow" or "upgrade" state when quota
  hits zero — don't let the button silently fail
- Subscription status screen: active/expired, renewal date, upsell if expired
- **On subscription lapse**: existing matches/chats remain fully accessible; only *sending
  new likes* is gated. Reflect this clearly in the UI — don't lock chat threads when a
  subscription expires.

**Matches & Chat**
- Stream Chat Flutter SDK for the messaging UI
- Voice notes as a fast-follow, not MVP-blocking
- **Unmatch action** available from a chat thread or match list (separate from Report/Block)
- Report and Block both reachable from a chat thread and from a profile view

**Notifications**
- Firebase Cloud Messaging for: new like, new match, new message
- Notification preferences screen — per-category toggles (this is expected by both app
  stores, not just a nice-to-have)

**Accessibility**
- Flutter Semantics widgets on every screen, not retrofitted at the end
- Sufficient color contrast, scalable text sizes respected throughout

---

## 2. Backend (NestJS + PostgreSQL) — API, Data Model, and Server-Side Rules

### 2.1 Stack
- **API framework**: NestJS (Node/TypeScript)
- **Database**: PostgreSQL
- **Auth**: Firebase Authentication (verify Firebase ID tokens server-side on every request)
- **Chat**: Stream Chat (backend issues Stream user tokens after Firebase auth succeeds)
- **Storage**: Firebase Storage or S3 for photos
- **Push**: Firebase Cloud Messaging, triggered server-side on like/match/message events
- **Payments**: Google Play Billing (Android) + RevenueCat to unify subscription state;
  add JazzCash/Easypaisa for web if targeting Pakistan directly
- **Rate limiting**: NestJS `ThrottlerModule` on all public-facing endpoints at minimum,
  stricter limits on auth, like, and report endpoints specifically
- **Moderation**: AWS Rekognition (image) + OpenAI Moderation API or Hive (text) — see §2.6
- **Verification**: AWS Rekognition (CompareFaces + Face Liveness) to start; Persona/Onfido
  if scaling

### 2.2 Finalized Data Model

```
users
  id, email, phone (unique, verified), gender, dob, location, auth_provider, created_at

profiles
  user_id, bio, education, profession, marital_status, photos[], verification_status
  -- verification_status: pending | verified | failed
  -- MUST reset to 'pending' whenever the primary photo changes

interests
  id, label            -- fixed list, e.g. "Reading", "Travel", "Sports"

user_interests
  user_id, interest_id -- many-to-many

languages
  id, label

user_languages
  user_id, language_id

likes
  id, from_user_id, to_user_id, created_at

passes                              -- NEW: prevents re-showing rejected profiles
  id, user_id, passed_user_id, created_at

blocks                              -- NEW: required for app store compliance
  id, blocker_id, blocked_id, created_at

matches
  id, user_a_id, user_b_id, matched_at

messages
  id, match_id, sender_id, content, sent_at

subscriptions
  id, user_id, status, started_at, renews_at, likes_remaining_today, quota_reset_at

verification_events
  id, user_id, selfie_url, match_score, result, reviewed_by (nullable), created_at
  -- one row per verification attempt, including re-verification events after photo changes

reports
  id, reporter_id, reported_id, reason, status, created_at
```

### 2.3 Critical Server-Side Rules (fixes from the original draft)

**Atomic like-quota decrement — prevents the double-tap race condition:**
```sql
UPDATE subscriptions
SET likes_remaining_today = likes_remaining_today - 1
WHERE user_id = $1 AND likes_remaining_today > 0
RETURNING likes_remaining_today;
```
Check rows-affected in application code. If zero rows updated, reject the like with a
"no likes remaining" response — never decrement via a separate read-then-write.

**Daily quota reset via scheduled job, not on login:**
- Use a NestJS `@Cron` job (or equivalent scheduler) to reset `likes_remaining_today` to
  the plan's daily allowance for all active subscriptions at a fixed time.
- Do **not** reset on login — that lets users trivially refresh their quota by logging
  out and back in.

**Minimum age enforcement, server-side, not just client-side:**
- Reject profile creation/update if computed age from `dob` is under 18, regardless of
  what the client sends.

**Feed query must exclude both passes and blocks:**
```sql
SELECT p.* FROM profiles p
WHERE p.gender != $my_gender
  AND p.user_id NOT IN (SELECT passed_user_id FROM passes WHERE user_id = $my_id)
  AND p.user_id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id = $my_id)
  AND p.user_id NOT IN (SELECT blocker_id FROM blocks WHERE blocked_id = $my_id)
  -- plus location radius, age range, interest-tag overlap scoring/ranking
```

**Verification re-trigger on photo change:**
- Any update to a profile's primary photo must set `verification_status = 'pending'`
  and enqueue a new verification job — treat this the same as first-time verification,
  including hiding the profile from browsing feeds until it resolves.

**Subscription lapse behavior:**
- Expired subscription → block only the "send like" endpoint (`likes_remaining_today`
  checks fail regardless of value once `subscriptions.status != 'active'`).
- Existing `matches` and `messages` remain fully queryable/accessible regardless of
  subscription status — do not gate chat read/write on subscription state.

**Duplicate-account prevention:**
- Enforce unique, verified phone numbers at the database level (`UNIQUE` constraint on
  `users.phone` where verified).
- Add device-fingerprint checks (Firebase App Check or equivalent) at signup as a second
  layer against multi-accounting, given the fully-paywalled like model increases the
  incentive to create duplicate accounts.

### 2.4 API Endpoints (core set)

```
POST   /auth/verify-token          -- verify Firebase ID token, issue session
POST   /auth/phone/verify          -- confirm OTP

GET    /profile/interests          -- fixed tag list
POST   /profile                    -- create/update profile
POST   /profile/photo              -- upload photo; triggers re-verification if primary

POST   /verification/selfie        -- submit live selfie, run liveness + face match
GET    /verification/status

GET    /feed                       -- paginated, filtered, ranked candidate profiles
POST   /feed/pass                  -- record a pass
POST   /feed/like                  -- atomic quota check + decrement, create like/match
POST   /feed/block                 -- record a block, remove from both feeds
DELETE /matches/:id                -- unmatch

GET    /matches
POST   /reports                    -- submit report (profile or message)

GET    /subscription/status
POST   /subscription/webhook       -- RevenueCat/Play Billing webhook

GET    /notifications/preferences
PUT    /notifications/preferences
```

### 2.5 Moderation (must ship with chat, not after payments)

- **Image moderation**: AWS Rekognition content moderation (or Hive) on every uploaded
  photo before it's visible to other users.
- **Text moderation**: OpenAI Moderation API (free) or Hive on bios at profile-save time,
  and on messages at send time — flag for human review rather than hard-blocking on first
  pass, to avoid false-positive frustration in a launch product.
- **Human review queue**: minimal admin endpoint/dashboard to review flagged content and
  reports — this can be basic tooling at MVP, but the reporting + blocking + flagging
  *pipeline* must exist before real users are messaging each other.

### 2.6 Revised MVP Build Order

1. Auth (email + Google + phone OTP) + profile creation + fixed interest/language tags
2. Selfie verification flow, including the re-verification-on-photo-change trigger
3. Browsing feed with gender/interest/location filtering + pass/block exclusion logic
4. Likes with atomic quota decrement + subscription gating
5. Match creation + chat (Stream Chat SDK) **with block/report/unmatch shipped alongside it**
6. Push notifications + notification preferences
7. Payments/subscription billing + lapse behavior (chat stays accessible, likes gated)
8. Moderation admin tooling (review queue) — the flagging pipeline itself is already live
   from step 5, this step is the human review interface on top of it

---

## 3. Explicitly Out of Scope Here
Legal/compliance review of biometric data handling, end-to-end encryption decision,
Pakistan-specific data protection requirements, and business-model risk (fully paywalled
likes and cold-start liquidity) are product/legal decisions, not frontend/backend
implementation details — revisit those separately before launch.