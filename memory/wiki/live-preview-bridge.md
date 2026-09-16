# Live Preview Bridge

**Summary**: Standalone Dart VM Service bridge providing double-buffered debounced hot-reloads and HTTP/WebSocket endpoints for developer tooling.

**Sources**: `raw/implementation-plan.md`, `raw/walkthrough.md`

**Last updated**: 2026-09-16

---

## Overview

The live preview bridge (`app/tool/live_preview_bridge.dart`) acts as a high-speed mediator between the IDE workspace and the running Flutter Dart VM Service `(source: walkthrough.md)`. It connects via WebSocket to `ws://127.0.0.1:8181/ws` and exposes an HTTP/WebSocket control plane on port `8182` `(source: implementation-plan.md)`.

## Double-Buffered Debouncing Queue

To eliminate frame-drop and recompile thrashing during rapid file edits, the bridge implements a 35ms double-buffer debounce window `(source: walkthrough.md)`:
- Incoming file modifications or save events reset the debounce timer.
- Once quiet, an atomic `ext.flutter.reassemble` RPC is triggered against the active root isolate `(source: walkthrough.md)`.
- If an edit occurs while a recompile is already in-flight, it is buffered and queued to fire immediately upon completion `(source: walkthrough.md)`.

## Supported Endpoints

The bridge exposes the following REST/WebSocket endpoints on `http://127.0.0.1:8182`:

| Endpoint | Method | Action |
|---|---|---|
| `/reload` | POST | Triggers debounced hot-reload (`ext.flutter.reassemble`) `(source: walkthrough.md)` |
| `/toggle-debug-paint` | POST | Toggles visual layout boundaries (`ext.flutter.debugPaint`) `(source: walkthrough.md)` |
| `/toggle-repaint-rainbow` | POST | Toggles repaint boundary visualization (`ext.flutter.repaintRainbow`) `(source: walkthrough.md)` |
| `/toggle-perf-overlay` | POST | Toggles engine performance overlay (`ext.flutter.showPerformanceOverlay`) `(source: walkthrough.md)` |
| `/status` | GET | Returns JSON payload with VM connection status, active isolate, and feature flags `(source: walkthrough.md)` |

## Related pages

- [[live-preview-pipeline]]
- [[hot-reload-optimization]]
- [[dev-preview-hud]]
