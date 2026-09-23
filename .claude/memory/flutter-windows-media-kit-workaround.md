---
name: flutter-windows-media-kit-workaround
description: Removed media_kit_video plugin to resolve Windows build EGL/egl.h missing error.
metadata:
  type: project
---

The media_kit_video plugin caused Windows build failures due to missing EGL/egl.h headers. The plugin was removed from the generated Windows plugin list (windows/flutter/generated_plugins.cmake) to unblock the build. This results in a runtime warning "media_kit: WARNING: package:media_kit_libs_*** not found" but does not prevent the app from launching and displaying UI. 

**Why:** The media_kit_video plugin has native Windows dependencies that weren't satisfied in the build environment, causing compilation errors.

**How to apply:** To restore video functionality, either: 1) Install the required Windows SDK dependencies for media_kit_video (Angle/EGL headers), or 2) Keep the plugin disabled if video features are not required for current development/testing.