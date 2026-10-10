Summary of changes made to remove Firebase authentication:

1. Deleted empty file: backend/src/auth/stream-token.ts
2. Updated backend/src/auth/auth.ts to keep only the fixed principal for development (no Firebase/Google login)
3. Created new mock controller: backend/src/auth/stream-token.controller.ts that returns a mock stream token
4. Updated backend/src/app.module.ts to import and add StreamTokenController to the controllers array
5. Updated Android build configuration: removed google-services plugin from app/android/app/build.gradle.kts
6. Updated .gitignore: removed Firebase service account line
7. Updated pubspec.yaml: kept stream_chat_flutter (as it's not Firebase-specific in our mock implementation) but removed any Firebase-related comments
8. Updated iOS configuration: no GoogleService-Info.plist found in the project (already deleted per git status)
9. Verified no remaining Firebase initialization in Dart code (chat screen uses our mock endpoint)

All Firebase authentication dependencies have been removed and replaced with mock implementations for development.