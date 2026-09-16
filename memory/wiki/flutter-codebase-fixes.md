# Flutter Codebase Fixes

**Summary**: Resolution of compilation errors, null-safety warnings, and async gap issues in the Rishta Flutter client.

**Sources**: `raw/implementation-plan.md`, `raw/walkthrough.md`

**Last updated**: 2026-09-16

---

## Resolved Issues

During infrastructure configuration, 11 compilation and linter errors were diagnosed by `flutter analyze` and resolved `(source: walkthrough.md)`:

1. **Generic Type Casting in API Client** (`lib/core/api.dart`):
   - `post`, `put`, and `delete` previously defaulted their parse function to `_asNull<T>`, causing `dynamic Function(Object?)` type mismatch errors `(source: implementation-plan.md)`.
   - Changed fallback parse handler to `(json) => json as T`, preserving non-null type safety `(source: walkthrough.md)`.

2. **Unnecessary Null-Aware Operators** (`lib/core/providers.dart`):
   - Dart 3.13+ flags `?[` on non-nullable map targets. Replaced `json?['onboarding']` and `json?['status']` with direct indexing `json[...]` `(source: walkthrough.md)`.

3. **Const Evaluation on Dynamic Widgets** (`lib/core/widgets.dart`):
   - Removed invalid `const` qualification on `LoadingView`'s `Semantics` wrapper `(source: walkthrough.md)`.

4. **Null Safety Flow Analysis** (`lib/features/feed/feed_screen.dart`):
   - Added null assertion `radius!.round()` inside slider label calculation `(source: walkthrough.md)`.

5. **Undefined `ChannelPage`** (`lib/features/matches/chat_screen.dart`):
   - Implemented standard `ChannelPage` wrapping `StreamChannel`, `StreamChannelHeader`, `StreamMessageListView`, and `StreamMessageInput` `(source: walkthrough.md)`.

6. **Async `BuildContext` Misuse** (`lib/features/settings/settings_screen.dart`):
   - Migrated device platform resolution to `defaultTargetPlatform == TargetPlatform.iOS` from `flutter/foundation.dart`, eliminating `Theme.of(context)` across async gaps `(source: walkthrough.md)`.

7. **Main App Navigation Callback Mismatch** (`lib/main.dart`):
   - Fixed `SelfieScreen` completion callback signature from `_refresh` to `() => _refresh(ref)` `(source: walkthrough.md)`.

## Verification Status

Verified with 100% passing tests and clean analyzer output `(source: walkthrough.md)`:
- `flutter analyze`: 0 errors, 0 warnings.
- `flutter test`: All smoke tests passing.

## Related pages

- [[live-preview-pipeline]]
- [[adaptive-theme-system]]
