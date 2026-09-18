# Work Remaining: Onboarding Photo Validation

## 📋 Issue Summary
The onboarding flow uses `PhotosScreen` (in `main.dart` line 125) which lacks the client-side photo resolution validation specified in the spec.

## ✅ Existing Working Solution
`PhotoGridScreen` already implements correct validation:
- Minimum dimension: 480×480px (line 42)
- Uses `instantiateImageCodec` to check dimensions before upload (lines 72-76)
- Shows blocking error dialog with specific message (lines 78-83)
- Returns early if validation fails (line 82)

## 🔧 What Needs to be Done
Add identical resolution validation to `PhotosScreen._add()` method in `photos_screen.dart`:

1. After picking image, before upload:
   - Read image bytes
   - Decode to check dimensions  
   - Validate against minimum threshold
   - Show spec-exact error modal if failed: 
     * Title: "Something went wrong"
     * Content: "Please provide a larger photo"
     * Single OK button
   - Return early if validation fails

## 🎯 Ponytail Approach
- **Reuse existing pattern**: Copy validation logic from `photo_grid_screen.dart` 
- **Match spec exactly**: Use the exact error message/title from spec observation
- **Minimal change**: Add ~10-15 lines to existing `_add()` method
- **Leverage existing infrastructure**: Use same `progress()` wrapper, `Storage.upload()`, provider updates

## 📊 Status
- **UI/UX screens**: 100% complete per spec (all 14 screens implemented correctly)
- **Architecture**: Follows spec recommendations for reusable components
- **Missing**: Only the photo resolution validation in the active onboarding flow
- **Effort**: Low - working implementation exists to adapt

## 🚫 What's NOT Needed
- No new dependencies (uses existing `image_picker`, `dart:ui`)
- No backend changes (validation is client-side per spec)
- No UI redesign (uses existing dialog patterns)