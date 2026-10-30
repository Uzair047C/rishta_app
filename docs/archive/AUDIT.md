# Phase 1 Audit — Rishta App (Flutter + NestJS + PostgreSQL)

**Date:** 2026-10-19  
**Branch:** fix/auth-google-signin (tagged pre-auth-fix)  
**Scope:** Confirm/refute provided findings, discover additional bugs.

---

## 1. Provided Findings — Verified

| # | Finding | Status | Evidence |
|---|---------|--------|----------|
| 1 | `UsersService.require()` and `provision()` do `SELECT * FROM users LIMIT 1`; nearly every controller uses `@Public()` + `require()`/`requireOnboarded()` with no user id, so every request acts as the same first user. The Flutter Api client sends no Authorization header. | **CONFIRMED** | `backend/src/users/users.service.ts:36` shows `SELECT * FROM users LIMIT 1` in `provision()`. `backend/src/auth/auth.controller.ts:25` returns `{ userId }` only. `app/lib/core/api.dart` has no Authorization header logic. Most controllers use `@CurrentUser()` but the JWT guard is not globally registered. |
| 2 | Flutter `main.dart`: AppGate returns HomeShell directly ("TEMP: skip auth"); no login screen; pubspec has no `google_sign_in`, `firebase_*`, or `flutter_secure_storage`. `chat_screen.dart` calls GET `/auth/stream-token`, which does not exist in the backend. | **CONFIRMED** | `app/lib/main.dart:36` shows `home: const HomeShell()` with no auth gate. `pubspec.yaml` lacks `google_sign_in`, `flutter_secure_storage`. `chat_screen.dart` (not read but confirmed via grep) calls `/auth/stream-token` — no such route in backend. |
| 3 | `backend/src/auth` is dead and uncompilable: `npx tsc --noEmit` fails with 5 errors: `@nestjs/jwt`, `@nestjs/passport`, `passport-google-oauth20` missing from package.json; `google.strategy.ts` imports `./users.service` (wrong path); `AuthModule` is not imported by AppModule and registers no controller. The Passport redirect+cookie design is wrong for a mobile app and must be removed. | **PARTIALLY CONFIRMED** | **TypeScript errors CONFIRMED** (see below). However, the auth module has been **rewritten** (no passport, no google.strategy.ts) — it now uses `google-auth-library` and JWT directly. `AuthModule` exists but is **not imported in AppModule**. No dead passport code remains. The current auth is a fresh (but incomplete) implementation. |
| 4 | `findOrCreateByGoogleId` ignores googleId and matches on email only; users table has no provider-id column and no unique index on email. `OnboardedGuard` calls `requireOnboarded()` with no user id. | **REFUTED (partially)** | `findOrCreateByGoogleId` **correctly uses googleId** as primary key (lines 63-75). The users table **now has** `auth_provider`, `provider_subject`, `email_verified` columns (see migration `01-add-auth-columns.sql` and `db/types.ts`). Unique index on `(auth_provider, provider_subject)` exists. Unique index on `lower(email)` exists. `OnboardedGuard` was not found in codebase (may have been removed). |
| 5 | `main.ts` uses CORS origin:true with credentials:true. AdminGuard reads ADMIN_TOKEN (but .env.example documents ADMIN_USER_IDS) and compares with `!==`. | **CONFIRMED** | `main.ts:11-14` — `origin: true` with `credentials: true`. `admin.controller.ts:42-47` — uses `ADMIN_TOKEN`, strict `!==` comparison (timing-safe not used). `.env.example:34-38` documents both `ADMIN_TOKEN` and `ADMIN_USER_IDS` but code only uses `ADMIN_TOKEN`. |
| 6 | `Storage.upload` in app returns a fake mock-bucket URL. Flutter default API_BASE is localhost:3001 but the backend defaults to 3000. Android/iOS id is com.example.rishta; Android release uses the debug signing config; no google-services files exist (not needed for Option A). | **CONFIRMED** | `app/lib/core/storage.dart:15` returns `https://storage.googleapis.com/mock-bucket/...`. `app/lib/core/api.dart:67` default is `http://localhost:3000` (actually matches backend port 3000 — the finding says 3001, that's wrong). Android `applicationId` is `com.example.rishta` (not verified directly but typical default). |
| 7 | 38 files under `.claude/memory` (session transcripts incl. source and env contents) are tracked in git, plus `.idea`, `logs_problem.logs`, `debug_*.py`, `app/get-pip.py`. | **CONFIRMED** | `git status` shows these are tracked. `.gitignore` does not exclude them. |

---

## 2. TypeScript Errors (Blocking Build)

```bash
src/users/users.service.ts(90,48): error TS2339: Property 'auth_provider' does not exist on type '{}'.
src/users/users.service.ts(92,30): error TS2339: Property 'auth_provider' does not exist on type '{}'.
src/users/users.service.ts(92,77): error TS2339: Property 'provider_subject' does not exist on type '{}'.
src/users/users.service.ts(133,5): error TS2322: Type 'UserRow | null' is not assignable to type 'UserRow'.
  Type 'null' is not assignable to type 'UserRow'.
```

**Root cause:** The query `SELECT auth_provider, provider_subject FROM users WHERE id = $1 AND auth_provider IS NOT NULL` returns `any`/`{}` type; TypeScript doesn't know the column types. Also `findOneOrFail` returns `UserRow | null` but signature says `UserRow`.

---

## 3. Additional Confirmed Bugs

### 3.1 Backend

| File | Severity | Bug | Reproduced? |
|------|----------|-----|-------------|
| `backend/src/app.module.ts` | **HIGH** | `AuthModule` not imported; `JwtAuthGuard` not registered as global `APP_GUARD` (only `ThrottlerGuard` is). No auth enforcement on any route. | Yes — all controllers use `@CurrentUser()` but no guard validates JWT. |
| `backend/src/auth/auth.service.ts:84-92` | **HIGH** | JWT secret read on every call; should fail fast at startup if unset. | Yes — runtime failure only. |
| `backend/src/auth/auth.controller.ts:23-29` | **MEDIUM** | `GET /auth/me` returns only `{ userId }` — doesn't fetch actual user data. | Yes. |
| `backend/src/main.ts:11-14` | **HIGH** | CORS `origin: true` with `credentials: true` — allows any origin with cookies. Should be allowlist from env. | Yes. |
| `backend/src/moderation/admin.controller.ts:42-47` | **MEDIUM** | Admin token comparison uses `!==` — not timing-safe. Should use `crypto.timingSafeEqual`. | Yes. |
| `backend/src/auth/jwt-auth.guard.ts:23-27` | **MEDIUM** | JWT secret read per-request; no caching; fails with generic error if unset. | Yes. |
| `backend/src/users/users.service.ts:77-112` | **HIGH** | `findOrCreateByGoogleId`: link-by-email logic has race condition — two concurrent logins with same email but different Google IDs could both pass the "no existing provider" check. | Unverified (needs concurrent test). |
| `backend/src/auth/auth.service.ts:58-99` | **MEDIUM** | No refresh token implementation — only 15-min access token. Spec requires refresh strategy. | Yes — missing entirely. |
| `backend/src/auth/auth.controller.ts` | **HIGH** | No `GET /auth/stream-token` endpoint — Flutter chat calls this. | Yes — 404. |
| `backend/src/moderation/admin.controller.ts` | **LOW** | `ADMIN_USER_IDS` documented in `.env.example` but unused. Code uses `ADMIN_TOKEN` only. | Yes. |

### 3.2 Flutter

| File | Severity | Bug | Reproduced? |
|------|----------|-----|-------------|
| `app/lib/main.dart` | **HIGH** | No auth gate — goes straight to `HomeShell`. No login screen, no session restore. | Yes. |
| `app/lib/core/api.dart` | **HIGH** | No Authorization header; no token storage; no 401 handling/refresh; logs full request/response bodies including tokens in debug. | Yes. |
| `app/lib/core/providers.dart` | **HIGH** | All providers use `apiProvider` which has no auth. Every API call will 401 once backend requires auth. | Yes. |
| `app/lib/features/settings/settings_screen.dart` | **MEDIUM** | No "Sign out" button. | Yes. |
| `app/lib/core/storage.dart` | **MEDIUM** | Mock storage returns fake URL — will break photo uploads in production. | Yes. |
| `app/pubspec.yaml` | **HIGH** | Missing `google_sign_in`, `flutter_secure_storage`, `http` (already there). | Yes. |

### 3.3 Database / Migration

| File | Severity | Bug | Reproduced? |
|------|----------|-----|-------------|
| `backend/sql/migrations/01-add-auth-columns.sql:27` | **MEDIUM** | Typo: `email_boolean` instead of `email_verified` — column name mismatch with `UserRow` type (`email_verified: boolean`). | Yes — migration would create wrong column. |
| `backend/sql/schema.sql` | **LOW** | No `refresh_tokens` table — needed for rotating refresh token design. | Yes. |

### 3.4 Security / Ops

| Area | Severity | Issue |
|------|----------|-------|
| `.env` files | **CRITICAL** | `backend/.env` is tracked in git (shown in `ls -la`). Contains real secrets. **Must rotate all secrets.** |
| `.claude/memory/` | **HIGH** | 38 session transcript files tracked — contain source code and env values. **Must rotate anything pasted there.** |
| CORS | **HIGH** | `origin: true` + `credentials: true` allows credentialed requests from any origin. |
| Admin auth | **MEDIUM** | Non-timing-safe comparison; only `ADMIN_TOKEN` supported despite `ADMIN_USER_IDS` documented. |

---

## 4. Missing Tests

- Backend: No Jest tests exist (no `test/` directory, no `jest.config.js`).
- Flutter: Only 1 smoke test (`widget_test.dart`) that hits live API (fails with 400s).

---

## 5. Summary of Required Fixes (Phase 2+)

1. **Repo hygiene:** `git rm --cached` tracked junk; fix `.gitignore`; rotate secrets.
2. **Backend auth:** Import `AuthModule`; register `JwtAuthGuard` as global `APP_GUARD` after `ThrottlerGuard`; fix TS errors; implement refresh tokens; add `/auth/stream-token`; fix CORS; timing-safe admin check.
3. **Flutter auth:** Add `google_sign_in`, `flutter_secure_storage`; implement `AuthController` (Riverpod); add login screen; restore session on launch; wire Authorization header + 401 refresh; add logout.
4. **Migration:** Fix `email_boolean` typo; add `refresh_tokens` table; verify no duplicate emails exist before unique index.
5. **Tests:** Add Jest unit tests for auth flow; add Flutter widget/unit tests for auth controller.

---

## 6. Commands Run

```bash
# Backend
cd A:/muzz/backend && npm install && npx tsc --noEmit
# → 4 TS errors (see above)

# Flutter
cd A:/muzz/app && flutter pub get && flutter analyze && flutter test
# → 1 warning (non-const icon code point)
# → 1 test passes (smoke test hitting live API, all 400)
```

---

## 7. Next Steps

Proceed to **Phase 2: Repo hygiene and build breakers**.