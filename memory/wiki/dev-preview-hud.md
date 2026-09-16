# Dev Preview HUD

**Summary**: In-app performance monitoring and state inspection overlay providing real-time FPS metrics, jank detection, and rendering boundary toggles.

**Sources**: `raw/implementation-plan.md`, `raw/walkthrough.md`

**Last updated**: 2026-09-16

---

## Overview

The developer preview HUD (`lib/core/dev/dev_preview_overlay.dart`) wraps the application root in debug mode `(source: walkthrough.md)`. In production/release mode, it compiles directly to the child widget with zero performance or memory overhead `(source: implementation-plan.md)`.

## Features

### Real-Time Frame Metrics
- Attaches to `SchedulerBinding.instance.addTimingsCallback` `(source: walkthrough.md)`.
- Calculates moving average FPS clamped between 1.0 and 120.0 FPS `(source: walkthrough.md)`.
- Measures build + raster time per frame in milliseconds `(source: walkthrough.md)`.
- Tracks dropped frames when frame time exceeds the 18.0ms jank threshold `(source: walkthrough.md)`.
- Displays dynamic color coding:
  - Green: ≥ 55 FPS
  - Amber: 40–54 FPS
  - Red: < 40 FPS `(source: walkthrough.md)`

### Rendering Toggles
- **Layout Bounds**: Toggles `debugPaintSizeEnabled` to inspect widget sizing and margins `(source: walkthrough.md)`.
- **Repaint Rainbow**: Toggles `debugRepaintRainbowEnabled` to verify repaint boundaries and prevent excessive rasterization `(source: walkthrough.md)`.
- **Theme Switcher**: Instantly toggles between light and dark Material 3 modes `(source: walkthrough.md)`.

### Viewport Simulation
Allows developers on desktop/web to preview layout rendering inside simulated physical viewports `(source: walkthrough.md)`:
- Fluid Desktop (full window)
- Mobile (390 x 844dp)
- Tablet (820 x 1180dp)

## Related pages

- [[live-preview-pipeline]]
- [[live-preview-bridge]]
- [[adaptive-theme-system]]
- [[responsive-layout-architecture]]
