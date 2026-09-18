# Photo Resolution Validation Implementation

## Missing Feature: Spec Section 10.5
**Error handling observed**: uploading a small/low-res image triggers a blocking modal — *"Something went wrong… Please provide a larger photo"* with a single **OK** button. This is a client-side minimum-resolution check, not a generic upload failure.

## Where to Implement: 
`app\lib\features\onboarding\photos_screen.dart` in the `_add` method, before the upload.

## Ponytail Approach (Lazy/Efficient):
1. Add image dimension check using `dart:io` File methods
2. Define minimum acceptable dimensions (need to determine from spec/app)
3. Show blocking modal with exact error message from spec
4. Only proceed with upload if validation passes

## Implementation Steps:
1. After `final picked = await ImagePicker().pickImage(...)` and before upload
2. Use `File(picked.path).lengthSync()` to check file size (optional)
3. Use image decoding to check dimensions:
   ```dart
   final bytes = await File(picked.path).readAsBytes();
   final img = await decodeImageFromList(bytes);
   final width = img.width;
   final height = img.height;
   ```
4. If width/height < minimum thresholds, show AlertDialog with:
   - Title: "Something went wrong"
   - Content: "Please provide a larger photo"
   - Single OK button
5. Only call Storage.upload() if validation passes

## Ponytail Optimization:
- Reuse existing `progress()` wrapper for loading state
- Use existing `ref.read(myProfileProvider.notifier).addPhoto()` flow
- Leverage existing error handling patterns from other screens
- Minimum effort: add ~10-15 lines of validation code

## Determining Minimum Dimensions:
Check if there are existing constants or look at similar validation elsewhere in codebase. If not found, use reasonable defaults like 320x240 or 480x360 based on common photo requirements.

## Error Modal Pattern:
Follow the same pattern as `showHelpSheet` or `showModalBottomSheet` used elsewhere in onboarding screens for consistency.