# Live Preview Pipeline

**Summary**: High-level overview of the ultra-low-latency live visual preview, state visualization, and hot-reload architecture configured for Anti Gravity IDE and VS Code.

**Sources**: `raw/implementation-plan.md`, `raw/walkthrough.md`

**Last updated**: 2026-09-16

---

## Overview

The live preview pipeline enables sub-100ms hot-reload feedback, hardware-accelerated rendering, and dynamic state inspection directly within the developer workspace `(source: walkthrough.md)`.

It connects the editor environment to running Flutter instances across multiple targets:
1. **Chrome CanvasKit**: Web preview with pixel-perfect Skia/CanvasKit rendering `(source: walkthrough.md)`.
2. **Windows Desktop Impeller**: Native hardware-accelerated desktop rendering via DirectX/Vulkan `(source: implementation-plan.md)`.
3. **Machine Daemon Mode**: Structured JSON-RPC runner (`flutter run --machine`) for IDE programmatic execution `(source: walkthrough.md)`.

## Core Components

- **Double-Buffered WebSocket Bridge**: Manages Dart VM Service communication with debounced recompile queuing `(source: walkthrough.md)`. See [[live-preview-bridge]].
- **Build Pipeline Optimization**: Scoped file watchers and persistent `.dill` cache directories `(source: implementation-plan.md)`. See [[hot-reload-optimization]].
- **In-App Dev Inspection HUD**: Real-time FPS monitoring and rendering toggles `(source: walkthrough.md)`. See [[dev-preview-hud]].
- **Adaptive Design & Layout**: Material 3 tokens and zero-overflow layout wrappers `(source: implementation-plan.md)`. See [[material-3-design-tokens]] and [[responsive-layout-architecture]].

## Related pages

- [[live-preview-bridge]]
- [[hot-reload-optimization]]
- [[dev-preview-hud]]
- [[responsive-layout-architecture]]
- [[adaptive-theme-system]]
