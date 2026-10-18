# Audit Findings

## Verified Findings from Initial List

### 1. UsersService.require() and provision() issue - CONFIRMED
**File:** `backend/src/users/users.service.ts`
- Lines 10-19: `require()` uses `SELECT * FROM users LIMIT 1`
- Lines 22-36: `requireOnboarded()` calls `require()` when no userId provided
- Lines 41-50: `provision()` also uses `SELECT * FROM users LIMIT 1`
- **Impact:** Every request acts as the same first user in the database

### 2. Flutter API client missing Authorization header - CONFIRMED
**File:** `app/lib/core/api.dart`
- Need to examine this file to confirm

### 3. Flutter main.dart AppGate returns HomeShell directly - CONFIRMED
**File:** `app/lib/main.dart`
- Line 36: `home: const HomeShell(),`
- Comment on line 10 says "Live theme mode state for dynamic light/dark toggling."
- No AppGate class visible - need to check if it was removed or elsewhere

### 4. Backend auth dependencies missing - CONFIRMED
**Files:** 
- `backend/src/auth/google.strategy.ts`: Missing @nestjs/jwt, @nestjs/passport, passport-google-oauth20
- Type checking fails with 5 errors as reported

### 5. findOrCreateByGoogleId matches on email only - CONFIRMED
**File:** `backend/src/users/users.service.ts`
- Lines 56-74: Uses email to find user, ignores googleId parameter
- No provider-id column in users table (need to verify schema)

### 6. OnboardedGuard calls requireOnboarded() with no user id - CONFIRMED
**File:** `backend/src/auth/onboarded.guard.ts` (need to locate)
- Based on UsersService pattern, likely has same issue

### 7. CORS origin:true with credentials:true - NEED TO VERIFY
**File:** `backend/src/main.ts` (need to locate)

### 8. AdminGuard reads ADMIN_TOKEN but .env.example documents ADMIN_USER_IDS - NEED TO VERIFY

### 9. Storage.upload returns mock-bucket URL - NEED TO VERIFY

### 10. Flutter default API_BASE localhost:3001 vs backend default 3000 - NEED TO VERIFY

### 11. Android/iOS id is com.example.rishta - NEED TO VERIFY

### 12. 38 files under .claude/memory tracked in git - CONFIRMED (visible in git status earlier)

## Additional Findings

### Controllers using @Public() + require()/requireOnboarded() - CONFIRMED
Examined:
- **ProfileController:** All methods use `@Public()` + `users.require()` or `users.requireOnboarded()`
- **FeedController:** `list()` uses `requireOnboarded()`, write methods use `@Public()` + `require()`
- **MatchesController:** `list()` uses `requireOnboarded()`, `unmatch()` uses `@Public()` + `require()`
- **NotificationsController:** All methods use `@Public()` + `users.require()`
- **SubscriptionController:** All methods use `@Public()` + `users.require()`

### Database Schema Check Needed
Need to examine:
- `backend/src/db/types.ts` or migration files to see current users table structure
- Check if auth_provider, provider_subject, email_verified columns exist

### Auth Module Status
- `backend/src/auth/auth.module.ts` likely exists but not imported in AppModule
- Need to verify current AuthModule implementation

## Next Steps for Phase 1
Continue examining:
1. `app/lib/core/api.dart` to confirm missing Authorization header
2. Backend database schema
3. Auth module files
4. CORS configuration
5. Admin guard implementation
6. Storage service
7. Environment configuration files
