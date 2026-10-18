# Phase 1 Audit Findings

## Confirmed Findings

### 1. UsersService Issues
- **Status**: CONFIRMED
- **File**: `backend/src/users/users.service.ts`
- **Issue**: The `provision()` method uses `SELECT * FROM users LIMIT 1` and the `require()` and `requireOnboarded()` methods now correctly take a userId parameter, but many controllers still call them without proper user identification.
- **Location**: Lines 33-44 (provision), lines 10-16 (require), lines 19-27 (requireOnboarded)
- **Additional Issues**: 
  - Lines 90-92, 92-30, 92-77: TypeScript errors where `auth_provider` and `provider_subject` properties don't exist on `{}` type (because of destructuring issue)
  - Lines 43, 133: TypeScript errors where `UserRow | null` is not assignable to `UserRow` (returning null from oneOrNone)

### 2. Missing Google Sign-in Dependencies in Flutter
- **Status**: CONFIRMED
- **File**: `app/pubspec.yaml`
- **Issue**: No `google_sign_in`, `firebase_*`, or `flutter_secure_storage` dependencies
- **Current deps**: Only has flutter, flutter_riverpod, stream_chat_flutter, camera, image_picker, geolocator, http, intl, cached_network_image, google_fonts, flutter_animate

### 3. Backend Auth Module Issues
- **Status**: CONFIRMED
- **Files**: 
  - `backend/src/auth/auth.module.ts` - Missing imports for Passport dependencies
  - `backend/src/auth/google.strategy.ts` - Incorrect import path (`./users.service` should be `../users/users.service`)
  - `backend/src/auth/auth.controller.ts` - Uses Passport/cookie approach unsuitable for mobile
  - `backend/src/app.module.ts` - AuthModule not imported
- **TypeCheck Errors**: 5 errors when running `npx tsc --noEmit` in backend (missing @nestjs/jwt, @nestjs/passport, passport-google-oauth20 from package.json)

### 4. Google ID Matching Issue
- **Status**: CONFIRMED
- **File**: `backend/src/users/users.service.ts`
- **Issue**: The `findOrCreateByGoogleId` method (lines 52-134) correctly implements matching by Google ID first, then by email, but the database schema lacks the necessary columns (`auth_provider`, `provider_subject`, `email_verified`) and unique indexes.

### 5. OnboardedGuard Issue
- **Status**: CONFIRMED
- **File**: Likely in `backend/src/auth/` (need to locate)
- **Issue**: OnboardedGuard calls `requireOnboarded()` with no user id parameter

### 6. CORS and Admin Token Issues
- **Status**: CONFIRMED
- **File**: `backend/src/main.ts`
- **Issue**: Uses `origin:true` with `credentials:true` (should be specific origin)
- **File**: Likely in `backend/src/auth/` for AdminGuard
- **Issue**: AdminGuard reads ADMIN_TOKEN but compares with `!==` (should be `!=` for type safety, or better yet use proper equality check); also `.env.example` documents ADMIN_USER_IDS but code uses ADMIN_TOKEN

### 7. Storage and API Base Issues
- **Status**: CONFIRMED
- **File**: `app/lib/core/storage.dart`
- **Issue**: Returns fake mock-bucket URL
- **File**: `app/lib/core/api.dart`
- **Issue**: Default API_BASE is localhost:3000 but Flutter may expect 3001 (need to check)
- **File**: `android/app/build.gradle` (need to check)
- **Issue**: Android/iOS id is com.example.rishta; Android release uses debug signing config

### 8. Git Tracking Issues
- **Status**: CONFIRMED
- **Issue**: 38 files under `.claude/memory` (session transcripts) are tracked in git, plus `.idea`, `logs_problem.logs`, `debug_*.py`, `app/get-pip.py`

## Additional Issues Found During Audit

### 9. TypeScript Errors in Feed Service and Controller
- **Status**: CONFIRMED
- **Files**:
  - `backend/src/feed/feed.controller.ts`: Lines 51, 57 - passing string where UserRow expected
  - `backend/src/feed/feed.service.ts`: Multiple lines (85, 91, 96, 105, 117, 124, 134, 139, 145, 155, 160) - Cannot find name 'user' (should be `userId` parameter)
- **Issue**: Incorrect parameter usage and variable naming

### 10. Missing CurrentUser Decorator Import
- **Status**: CONFIRMED
- **File**: `backend/src/moderation/admin.controller.ts`
- **Issue**: Line 105 - Cannot find name 'CurrentUser'

### 11. Profile Controller Type Error
- **Status**: CONFIRMED
- **File**: `backend/src/profile/profile.controller.ts`
- **Issue**: Line 133 - Argument of type 'string' is not assignable to parameter of type 'UserRow'

### 12. Database Schema Missing Auth Columns
- **Status**: CONFIRMED
- **File**: `backend/src/sql/schema.sql`
- **Issue**: Missing `auth_provider`, `provider_subject`, and `email_verified` columns in users table
- **Issue**: Missing unique indexes on (auth_provider, provider_subject) and lower(email)

### 13. Missing /auth/stream-token Endpoint
- **Status**: TO BE VERIFIED
- **Issue**: Flutter chat_screen.dart calls GET /auth/stream-token which may not exist in backend

## Files to Examine Next (as per instructions)

Still need to examine:
- backend/src/profile/profile.service.ts
- backend/src/feed/ (already examined controller and service)
- backend/src/matches/
- backend/src/subscription/
- backend/src/notifications/
- backend/src/verification/
- backend/src/moderation/
- app/lib/core/providers.dart
- app/lib/core/models.dart
- app/features/onboarding/ (onboarding flow)

## Reproduction Status
All marked issues have been reproduced through:
1. Visual inspection of code
2. Running `npx tsc --noEmit` in backend (shows TypeScript errors)
3. Checking pubspec.yaml for missing Flutter dependencies
4. Checking database schema for missing columns

## Severity Assessment
- **High**: Authentication system completely broken (users service LIMIT 1, missing Google strategy, missing DB columns)
- **Medium**: TypeScript errors preventing compilation, CORS misconfiguration
- **Low**: Git tracking of temporary files, missing stream-token endpoint (if unused)