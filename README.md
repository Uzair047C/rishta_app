# Rishta

Flutter + NestJS/PostgreSQL matchmaking app.

```
backend/   NestJS API, PostgreSQL schema
app/       Flutter client (Riverpod)
```

---

## Backend

```bash
cd backend
npm install
cp .env.example .env          # fill in all required vars (see below)
npm run db:migrate            # applies migrations from sql/migrations/
npm run dev                   # nest start --watch on :3000
npm run typecheck             # tsc --noEmit
npm test                      # jest (requires Postgres)
```

### Required environment variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string | ✅ |
| `DATABASE_SSL` | `true`/`false` — enable TLS | |
| `DATABASE_SSL_CA` | PEM-encoded CA for custom CAs | |
| `DATABASE_SSL_INSECURE` | `true`/`false` — allow unverified TLS (dev only) | |
| `DB_POOL_MAX` | Connection pool max size (default 10) | |
| `JWT_SECRET` | HS256 secret, min 32 chars | ✅ |
| `JWT_ACCESS_TTL_MINUTES` | Access token TTL (default 15) | |
| `JWT_REFRESH_TTL_DAYS` | Refresh token TTL (default 30) | |
| `JWT_ISSUER` | JWT `iss` claim (default `rishta-api`) | |
| `JWT_AUDIENCE` | JWT `aud` claim (default `rishta-app`) | |
| `FIREBASE_PROJECT_ID` | Firebase project ID | ✅ |
| `FIREBASE_CLIENT_EMAIL` | Firebase service account email | ✅ |
| `FIREBASE_PRIVATE_KEY` | Firebase service account private key (with `\n`) | ✅ |
| `STREAM_API_KEY` | Stream Chat API key | ✅ |
| `STREAM_API_SECRET` | Stream Chat API secret | ✅ |
| `REVENUECAT_WEBHOOK_SECRET` | RevenueCat webhook signature secret | ✅ |
| `CORS_ORIGINS` | Comma-separated allowed origins (no defaults in prod) | ✅ |
| `ADMIN_TOKEN` | Legacy admin token (deprecated) | |
| `ADMIN_USER_IDS` | Comma-separated admin user UUIDs | |
| `REDIS_URL` | Redis for distributed throttling (optional) | |
| `STORAGE_BUCKET_HOST` | Firebase Storage host override | |
| `STORAGE_BUCKET_NAME` | Firebase Storage bucket name | |
| `NODE_ENV` | `development` \| `production` \| `test` | |
| `PORT` | HTTP port (default 3000) | |
| `TRUST_PROXY` | `true`/`false` — trust `X-Forwarded-For` | |

### Health checks

- `GET /health` — liveness (always 200)
- `GET /ready` — readiness (checks DB connectivity)

### Migration flow

Migrations live in `sql/migrations/` and are managed by `node-pg-migrate`:
- `npm run db:migrate` — apply pending migrations
- `npm run db:migrate:create <name>` — create new migration file
- `npm run db:migrate:down` — rollback last migration

Seed data (dev only):
```bash
npm run db:seed    # refuses to run when NODE_ENV=production
```

### Notable implementations

- **`Repo<T>`** (`src/db/db.ts`) — generic table gateway; column allowlist per table.
- **Stream tokens** (`src/auth/auth.service.ts:getStreamToken`) — issues Stream server token.
- **Moderation** (`src/moderation/`) — flags for human review; degrades to passthrough when unconfigured.
- **Structured logging** (`src/main.ts`) — JSON logs with request ID + user ID; PII redacted.
- **Account deletion** (`src/account/account.controller.ts`) — cascade + storage cleanup; GDPR export endpoint.
- **Refresh tokens** — SHA-256 stored, rotation with reuse detection, family revocation.
- **Outbox pattern** — async side effects (push, etc.) via `outbox` table + pg-boss worker.

---

## App

```bash
cd app
flutter pub get
flutter run --dart-define=API_BASE=http://10.0.2.2:3000 \
            --dart-define=STREAM_API_KEY=your_stream_key
```

`10.0.2.2` is the Android emulator's alias for the host machine.

### Structure

- `lib/core/` — `theme.dart` (design tokens), `api.dart` (generic HTTP client), `models.dart`, `providers.dart`, `widgets.dart` (`AsyncView`)
- `lib/features/` — one folder per area, one file per screen

---

## Known stubs (intentionally incomplete)

| Area | File | Status |
|------|------|--------|
| **Store billing** | `app/lib/features/subscription/subscription_screen.dart` | `_purchase` throws `UnimplementedError` in release; RevenueCat/Play Billing pending |
| **Face Liveness client** | `app/lib/features/onboarding/selfie_screen.dart` | Uses `camera` package; swap for Amplify `FaceLivenessDetector` |
| **Device fingerprint** | `app/lib/core/auth_providers.dart` | `device_id` not sent; Firebase App Check intended |
| **Push notifications** | `backend/src/notifications/push.service.ts` | Log-only stub; integrate FCM/APNs/SNS for production |
| **Photo storage** | `app/lib/core/storage.dart` | Mock bucket URL; replace with Firebase Storage upload |

---

## Deliberate deviations from the spec

1. **`profiles.name` added.** §1.2 lists Name as a profile-creation field; §2.2 data model has no column.
2. **`notification_preferences`, `device_tokens`, `moderation_flags` added.** Required by §2.4/2.5 endpoints but missing from §2.2.
3. **`gender` and `dob` nullable.** Created before onboarding completes; `CHECK` keeps them consistent.
4. **Feed excludes already-liked profiles.** §2.3 names passes/blocks only; outgoing like = swipe-past.
5. **`CANCELLATION` keeps status `active`.** Paid through `renews_at`; nightly job expires it.
6. **Photo bytes never touch API.** Client uploads to Firebase Storage; `POST /profile/photo` records URL.
7. **`flutter_svg` omitted.** No SVG assets; will add when first vector asset lands.

---

## Still open

- **Store billing.** RevenueCat/Play Billing integration.
- **Face Liveness client SDK.** Amplify `FaceLivenessDetector` integration.
- **Device fingerprint.** Firebase App Check integration.
- **Push notifications.** FCM/APNs/SNS integration.
- **Photo privacy controls, guardian/family involvement, religion/sect/city filters, report SLAs.** Product features (see `docs/scaling-plan.md`).