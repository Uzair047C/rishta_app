# High-Performance Flutter Live Preview & IDE State Visualization Infrastructure

Configure the Anti Gravity IDE workspace (`a:\muzz`) to deliver an ultra-low-latency live preview, double-buffered WebSocket VM Service bridge, dynamic state visualization HUD, adaptive Material 3 design system, and multi-breakpoint responsive layout engine.

## User Review Required

> [!IMPORTANT]
> - **Workspace Config Locations**: Configuration files will be provided for both `.antigravity/` and `.vscode/` so that Anti Gravity IDE natively picks up the runner profiles, scoped watchers, tasks, and debugger targets.
> - **Fixing 11 Existing Compiler Errors**: `flutter analyze` identified 11 blocking compiler errors in the existing codebase (type mismatches in `api.dart`, missing `ChannelPage` in `chat_screen.dart`, invalid constructor call in `main.dart`, and null-safety warnings). These must be resolved for hot reload and live preview to compile.
> - **Web & Desktop Target Support**: We will ensure the Flutter app has platform targets configured for both **Chrome (CanvasKit web-renderer)** and **Windows (Impeller/DirectX hardware acceleration)** for ultra-fast local previews.

---

## Proposed Changes

### 1. IDE Infrastructure & Build Pipeline Configuration

#### [NEW] [launch.json](file:///a:/muzz/.antigravity/launch.json) and [launch.json](file:///a:/muzz/.vscode/launch.json)
Configure launch profiles for Anti Gravity IDE:
- **`Flutter: Live Preview (CanvasKit Web)`**: Fast feedback loop with flags:
  `flutter run -d chrome --web-renderer canvaskit --hot-reload-on-save --enable-experiment=non-nullable --vm-service-port=8181 --observatory-port=8181 --track-widget-creation`
- **`Flutter: Desktop Impeller (Hardware Accelerated)`**: High-fidelity desktop runtime with:
  `flutter run -d windows --enable-impeller --vm-service-port=8181 --observatory-port=8181 --track-widget-creation`
- **`Flutter: Daemon / Machine Mode (RPC)`**: For IDE-managed JSON-RPC control via `--machine`.
- Caching configurations for incremental `.dill` builds in `.dart_tool/flutter_build/`.

#### [NEW] [tasks.json](file:///a:/muzz/.antigravity/tasks.json) and [tasks.json](file:///a:/muzz/.vscode/tasks.json)
- IDE tasks for launching the double-buffered VM service bridge, triggering instant hot-reload (`r`), toggling debug paint bounds, repaint rainbow, and performance overlays.

#### [NEW] [settings.json](file:///a:/muzz/.antigravity/settings.json) and [settings.json](file:///a:/muzz/.vscode/settings.json)
- Strictly scope `files.watcherExclude` to eliminate rebuild overhead from non-source directories (`.dart_tool`, `build`, `android`, `ios`, `windows`, `backend`, `memory`), focusing file watchers strictly on `lib/` and `assets/`.
- Enable Flutter UI guides, widget creation tracking, and automatic hot-reload on save.

---

### 2. Live Preview WebSocket Bridge & Inspection Engine

#### [NEW] [live_preview_bridge.dart](file:///a:/muzz/app/tool/live_preview_bridge.dart)
A lightweight standalone Dart VM Service bridge:
- Connects to Dart VM Service (`ws://127.0.0.1:8181/ws`).
- Implements a double-buffer debouncing queue (<40ms) to coalesce rapid file modifications into single clean reloads without UI stutter.
- Exposes local JSON-RPC / WebSocket endpoints for sub-100ms hot reload triggers and render inspection RPCs:
  - `ext.flutter.debugPaint` (layout bounds)
  - `ext.flutter.repaintRainbow` (repaint boundaries)
  - `ext.flutter.showPerformanceOverlay` (frame budget graphs)
  - `ext.flutter.inspector.show` (render-tree selection)

---

### 3. Modular Flutter Architecture & Design System

#### [NEW] [breakpoints.dart](file:///a:/muzz/app/lib/core/constants/breakpoints.dart)
- Breakpoint tokens: Mobile (<600dp), Tablet (600–1024dp), Desktop (>1024dp), UltraWide (>1440dp).
- Content max-width constants, margin tokens, and grid column definitions.

#### [NEW] [app_constants.dart](file:///a:/muzz/app/lib/core/constants/app_constants.dart)
- Timing & animation durations, minimum touch target dimensions (48dp), frame budgets (16.6ms for 60fps, 8.3ms for 120fps).

#### [NEW] [tokens.dart](file:///a:/muzz/app/lib/core/theme/tokens.dart)
- Comprehensive design tokens:
  - Brand seed and tonal palettes
  - Elevation and drop shadow definitions (`ElevationTokens`)
  - Border radius tokens (`radiusSm`, `radiusMd`, `radiusLg`, `radiusPill`)
  - Spacing scale (`spaceXs`, `spaceSm`, `spaceMd`, `spaceLg`, `spaceXl`, `space2Xl`)
  - Typography scales utilizing Google Fonts (Inter / Outfit) with line heights and tracking.

#### [NEW] [app_theme.dart](file:///a:/muzz/app/lib/core/theme/app_theme.dart)
- Material 3 theme builder (`ColorScheme.fromSeed`) supporting instant light/dark mode adaptation.
- Cohesive styling for `CardTheme`, `FilledButtonTheme`, `InputDecorationTheme`, `NavigationBarTheme`, and `AppBarTheme`.

#### [MODIFY] [theme.dart](file:///a:/muzz/app/lib/core/theme.dart)
- Re-export modular theme and token symbols for backwards compatibility with existing screens.

#### [NEW] [responsive_layout.dart](file:///a:/muzz/app/lib/core/layout/responsive_layout.dart)
- `ResponsiveLayout`: Builds layout variations targeting mobile, tablet, and desktop breakpoints.
- `AdaptiveContainer`: Constrains and centers content on wider viewports to eliminate overflow while maintaining mobile touch ergonomics.
- `ResponsiveValue<T>`: Resolves responsive values based on the active breakpoint.

#### [NEW] [dev_preview_overlay.dart](file:///a:/muzz/app/lib/core/dev/dev_preview_overlay.dart)
- In-app live preview HUD:
  - Real-time 60/120 FPS counter with frame-drop detection and millisecond frame timing.
  - Floating dev toolbar with instant toggles:
    - 📐 Layout Bounds (`debugPaintSizeEnabled`)
    - 🌈 Repaint Rainbow (`debugRepaintRainbowEnabled`)
    - 📈 Performance Overlay (`showPerformanceOverlay`)
    - 🌓 Light / Dark theme switch
    - 📱 Device viewport preview (Mobile 390x844, Tablet 820x1180, Desktop fluid)

#### [MODIFY] [main.dart](file:///a:/muzz/app/lib/main.dart)
- Integrate `DevPreviewOverlay` (in debug mode) and `ResponsiveLayout` into root `RishtaApp`.
- Add dynamic theme switching provider/notifier.
- Fix callback signature mismatch in `VerificationPendingScreen`.

---

### 4. Codebase Fixes for Clean Compilation & Hot Reload

#### [MODIFY] [api.dart](file:///a:/muzz/app/lib/core/api.dart)
- Fix generic nullability for `post`, `put`, and `delete` methods.

#### [MODIFY] [providers.dart](file:///a:/muzz/app/lib/core/providers.dart)
- Clean up redundant null-aware operators (`?[` -> `[`).

#### [MODIFY] [widgets.dart](file:///a:/muzz/app/lib/core/widgets.dart)
- Fix non-const `CircularProgressIndicator` in `LoadingView`.

#### [MODIFY] [feed_screen.dart](file:///a:/muzz/app/lib/features/feed/feed_screen.dart)
- Fix null assertion on `radius!.round()`.

#### [MODIFY] [chat_screen.dart](file:///a:/muzz/app/lib/features/matches/chat_screen.dart)
- Define standard `ChannelPage` widget using Stream Chat prebuilt components.

#### [MODIFY] [selfie_screen.dart](file:///a:/muzz/app/lib/features/onboarding/selfie_screen.dart)
- Remove unnecessary null-aware operator.

---

## Verification Plan

### Automated Verification
- Run `flutter analyze` in `a:/muzz/app` to verify 0 errors and 0 warnings.
- Run `dart analyze tool/live_preview_bridge.dart` to verify tool code correctness.

### Live Preview & State Introspection Verification
- Validate the `.antigravity/launch.json` and `.vscode/launch.json` configurations.
- Verify that `DevPreviewOverlay` toggles layout bounds, repaint rainbow, and frame rate counters without triggering unwanted rebuild cascades.
- Verify responsive layout adaptation across simulated mobile, tablet, and desktop breakpoints.
