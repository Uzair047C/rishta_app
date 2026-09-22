# Rishta Matchmaking App — Architecture Overview

## Stack
- **Frontend**: Flutter (Riverpod, Material 3) — `app/`
- **Backend**: NestJS + TypeScript — `backend/`
- **Database**: PostgreSQL — `backend/sql/schema.sql`
- **Auth**: Firebase Auth (client) + Firebase Admin (server)
- **Realtime**: Stream Chat (token from backend)
- **Push**: FCM via Firebase Admin
- **Verification**: AWS Rekognition (liveness + face match)

---

## How the Three Layers Connect

### 1. API Contract (`app/lib/core/api.dart` ↔ `backend/src/*/controller.ts`)

Single generic `Api` class — callers pass the path + parse function.
```dart
// Frontend
final json = await api.post<Map<String, dynamic>>('/auth/verify-token');
await api.post('/profile', body: dto);
await api.get('/feed', FeedCard.fromJson);
```

```typescript
// Backend — each controller method = one endpoint
@Post('verify-token') async verifyToken(@Auth() p: Principal) { ... }
@Post() async save(@Auth() p: Principal, @Body() dto: ProfileDto) { ... }
@Get() async list(@Auth() p: Principal, @Query() q: FeedQuery) { ... }
```

**Error mapping**: Backend throws `HttpException` with `message` = error code (e.g. `no_likes_remaining`). Frontend `Api._messageOf()` extracts it → `ApiError` enum → user-facing string.

### 2. Auth Flow — The Glue

```
Flutter app cold start
       │
       ▼
FirebaseAuth.currentUser?.getIdToken()
       │
       ▼
POST /auth/verify-token  (Bearer <idToken>)
       │
       ▼
NestJS FirebaseGuard verifies token → Principal {uid, email, phone}
       │
       ▼
UsersService.provision(principal, deviceId?)
       │
       ├── creates users row if new (id, firebase_uid, email, phone, device_id)
       └── returns user row
       │
       ▼
Response: { user, onboarding: { profileComplete, verificationRequired } }
       │
       ▼
Frontend SessionNotifier sets Session(signedIn, profileComplete)
```

**Key point**: Every subsequent request includes the same ID token → `FirebaseGuard` validates on *every* request (spec 2.1).

### 3. Database ↔ Backend — Single Source of Truth

`backend/src/db/db.ts` is the only SQL layer.

- `Db` (injectable) — pool + transaction helper
- `Repo<T>` — generic table gateway (insert/set/remove/byId)
- `Reader` — `all()`, `one()`, `count()` helpers

**All SQL lives in service files** (feed.service.ts, profile.service.ts, etc.), not in repositories. This keeps race-sensitive logic (like quota decrement) as literal SQL where it's auditable.

```typescript
// Example: atomic like quota (feed.service.ts:110-118)
await conn.query(`
  UPDATE subscriptions
     SET likes_remaining_today = likes_remaining_today - 1
   WHERE user_id = $1 AND status = 'active' AND likes_remaining_today > 0
 RETURNING likes_remaining_today
`, [user.id]);
```

### 4. Database ↔ Frontend — Models Mirror Tables

| Table | Backend Type (`db/types.ts`) | Frontend Model (`core/models.dart`) |
|-------|------------------------------|-------------------------------------|
| `users` | `UserRow` | embedded in `MyProfile.user` |
| `profiles` | `ProfileRow` | `MyProfile` + `ProfileSummary` |
| `interests`/`languages` | `TagRow` | `Tag` |
| `matches` | `MatchRow` | `MatchSummary` |
| `subscriptions` | `SubscriptionRow` | `Subscription` |
| feed query | `FeedCard` | `FeedCard` |

**Parsing**: Frontend `Json` helpers (`intg`, `str`, `optStr`, `children`) handle nullable/optional fields safely.

### 5. Onboarding Flow — End-to-End

```
ProfileFormScreen (name, dob, gender, location, bio, education, profession,
                   marital, interests[], languages[])
        │ POST /profile (ProfileDto)
        ▼
PhotosScreen (≥3 photos, first = primary)
        │ Storage.upload() → URL
        │ POST /profile/photo {url, makePrimary}
        ▼
SelfieScreen (liveness session → selfie)
        │ POST /verification/liveness-session
        │ POST /verification/selfie {livenessSessionId}
        ▼
VerificationStatus = 'verified' → Feed unlocks
```

**Server enforces**:
- Age ≥ 18 (DB trigger `enforce_min_age`)
- Min 3 photos (client gate, server allows but feed requires verified)
- Verified status for feed visibility (feed query: `p.verification_status = 'verified'`)

### 6. Feed / Like / Match — Critical Path

```
GET /feed?minAge&maxAge&radiusKm
        │
        ▼
FeedService.feed(user, filters)
        │ Single CTE query with:
        │ - gender filter (opposite)
        │ - age range
        │ - distance (Haversine)
        │ - exclude passes/blocks/likes/matches
        │ - ORDER BY shared_interests DESC, distance ASC
        ▼
List<FeedCard> → Frontend FeedCard extends ProfileSummary

POST /feed/like {userId}
        │
        ▼
FeedService.like(user, targetId)
        │ 1. Atomic quota decrement (see above)
        │ 2. INSERT INTO likes
        │ 3. Check reciprocal like → INSERT INTO matches (normalized pair)
        │ 4. Push notifications to both users
        ▼
LikeResult { matched, matchId, likesRemainingToday }
```

### 7. Subscription / Quota

- Every user has a `subscriptions` row (created lazily by `SubscriptionService.ensure()`)
- Free plan: 10 likes/day (config `FREE_PLAN_DAILY_LIKES`)
- Nightly cron (midnight) resets `likes_remaining_today = daily_allowance` + expires lapsed plans
- RevenueCat webhook → `SubscriptionService.applyWebhook()` updates status/plan/renews_at

### 8. Verification — Re-opens on Primary Photo Change

```
ProfileService.addPhoto() / setPhotos()
        │
        ▼
DB trigger: profiles_reverify_on_photo_change
        │ (NEW.photos[1] IS DISTINCT FROM OLD.photos[1])
        ▼
profiles.verification_status := 'pending'
        │
        ▼
VerificationService.reopen(userId, reason)
        │ INSERT INTO verification_events (result='pending')
        ▼
Client polls GET /verification/status → 'pending' → shows SelfieScreen again
```

### 9. Push Notifications

```
FeedService.like() → PushService.toUser(targetId, 'new_like', {fromUserId})
MatchesController.unmatch() → (no push)
Messages → PushService.toUser(targetId, 'new_message', {...})

PushService.toUser():
  1. Check notification_preferences toggle
  2. Read device_tokens for user
  3. Firebase Admin sendEachForMulticast()
  4. Prune dead tokens (unregistered/invalid)
```

---

## File Map — Where to Look

| Concern | Backend | Frontend |
|---------|---------|----------|
| Auth | `auth/auth.ts`, `auth/auth.controller.ts` | `providers.dart` (SessionNotifier), `api.dart` (token provider) |
| Profile CRUD | `profile/profile.service.ts`, `profile/profile.controller.ts` | `providers.dart` (MyProfileNotifier), `onboarding/profile_form_screen.dart` |
| Photos | `profile/profile.service.ts` (addPhoto/setPhotos) | `onboarding/photos_screen.dart`, `core/storage.dart` |
| Feed | `feed/feed.service.ts`, `feed/feed.controller.ts` | `feed/feed_screen.dart`, `providers.dart` (feedProvider) |
| Like/Match | `feed/feed.service.ts` (like), `matches/matches.controller.ts` | `feed/feed_screen.dart` (_FeedCardView), `matches/matches_screen.dart` |
| Subscription | `subscription/subscription.service.ts`, `subscription/subscription.controller.ts` | `subscription/subscription_screen.dart`, `providers.dart` (subscriptionProvider) |
| Verification | `verification/verification.service.ts`, `verification/verification.controller.ts` | `onboarding/selfie_screen.dart`, `providers.dart` (verificationProvider) |
| Notifications | `notifications/push.service.ts`, `notifications/notifications.controller.ts` | `settings/settings_screen.dart` |
| Moderation | `moderation/moderation.service.ts` | (auto on bio/photo/message) |

---

## Current Gaps / Known Simplifications

1. **Firebase config**: `.env` has empty `FIREBASE_SERVICE_ACCOUNT_BASE64` — backend runs but auth fails without it.
2. **AWS Rekognition**: Not configured — `VerificationService` runs in dev bypass mode (auto-approves with warning).
3. **Stream Chat**: `STREAM_API_KEY/SECRET` empty — chat tokens not issued.
4. **RevenueCat**: `REVENUECAT_WEBHOOK_SECRET` empty — subscription webhooks rejected.
5. **AppGate bypassed**: `main.dart:93` returns `HomeShell()` directly — onboarding/verification gating disabled for inner-loop dev.
6. **No tests**: Zero test files in either frontend or backend.

---

## Next Steps to Make It "Real"

1. Fill `.env` with real credentials (Firebase SA, AWS keys, Stream, RevenueCat)
2. Run `backend/sql/schema.sql` + `seed.sql` against a Postgres instance
3. `cd backend && npm run start:dev` (port 3001)
4. `cd app && flutter run -d chrome --dart-define=API_BASE=http://localhost:3001`
5. Remove AppGate bypass → enable full onboarding→verification→feed flow

---

## Why this works

Every layer speaks the same language (JSON over HTTP), the database owns invariants (triggers, constraints, unique indexes), and the backend is the *only* place that mutates data — the frontend is a pure view layer with optimistic UI that reconciles on every server response.

**ponytail**: No redundant abstraction layers. One Api class, one Db class, one Repo<T>. If it needs to change, you change it in one file.

---

## Related

[[muzz-onboarding-flow-spec]], [[walkthrough]], [[implementation-plan]], [[prompt-md]]