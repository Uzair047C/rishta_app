---
name: full-stack-connection-summary
description: Overview of how Flutter frontend, NestJS backend, and PostgreSQL database are interconnected in the Rishta app.
metadata:
  type: project
---

The Rishta app consists of three main parts:

1. **Flutter Frontend** (`/app`): 
   - Communicates with the backend via the `Api` class in `lib/core/api.dart`.
   - Uses `http` package to make RESTful calls to `http://localhost:3001` (default from `String.fromEnvironment('API_BASE', defaultValue: 'http://localhost:3001')`).
   - Attaches JWT token (obtained via Firebase Auth or custom auth) in the Authorization header.
   - Handles API error codes defined in `ApiError` enum, mapping backend error strings to user-friendly messages.

2. **NestJS Backend** (`/backend`):
   - Built with NestJS (Node.js/TypeScript) and exposed on port 3001 (as seen in the frontend's default API base).
   - Uses `@nestjs/config` to load environment variables (`.env` file).
   - Data layer: PostgreSQL database via the `pg` client (wrapped in `src/db/db.ts`).
   - Authentication: Verifies Firebase ID tokens (using `firebase-admin`) to authenticate requests; endpoints are guarded by AuthMiddleware (likely in `src/auth/auth.ts`).
   - Services: 
     - `users.service.ts` handles user-related DB operations.
     - `profile.service.ts` manages profile data.
     - `feed.service.ts` and `matches.service.ts` implement core app logic.
     - `push.service.ts` (in notifications) uses Firebase Admin to send push notifications via FCM.
   - Real-time features: Not explicitly shown but `stream_chat_flutter` dependency suggests Stream.io chat integration; however, the primary API is REST.

3. **PostgreSQL Database**:
   - Managed by scripts in `/backend/sql` (schema and seed files).
   - Initialized via `npm run db:init` (which runs `node db-init.js`).
   - Connection details are in `.env` (e.g., `POSTGRES_HOST`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`).
   - The `db.ts` module exports a `postgres` instance used by services via dependency injection (likely through a `DbService`).

**Integration Points**:
- Frontend → Backend: HTTP JSON API (REST) with JWT auth.
- Backend → Database: Direct SQL queries via `pg` (or possibly an ORM like TypeORM; need to check `src/db/types.ts` for entities).
- Backend → Firebase: Admin SDK initialized with service account (from `.env` `FIREBASE_SERVICE_ACCOUNT`) to verify ID tokens and send push notifications.
- Firebase (client-side): Flutter app uses `firebase_core` and `firebase_messaging` for push notification setup on device; backend uses admin SDK to send to FCM.

**Current State**:
- The Flutter app builds and runs on Windows (after fixing `firebaseOptions` and disabling `media_kit_video`).
- The backend is reported to be already running (user said "backend is already running").
- Database connectivity assumed to be functional if backend starts without errors (check `server.log` for connection logs).
- Firebase initialization in the app currently fails (dummy options) but the app continues; Firebase-dependent features (auth, push) will not work until proper `firebase_options.dart` is provided for desktop.

**Next Steps for Full Integration**:
1. Generate proper Firebase desktop options via `flutterfire configure` and replace the dummy `firebaseOptions` in `lib/main.dart`.
2. Ensure the backend's `.env` contains correct Firebase service account credentials and PostgreSQL connection string.
3. Verify that the backend can connect to PostgreSQL (check logs for `connected to database`).
4. Test end-to-end: signup/login via frontend → token issuance → API calls returning data from PostgreSQL.

This memory captures the current linkage and what remains to be done for full end-to-end functionality.