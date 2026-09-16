# LLM Wiki — Log

Append-only record of wiki operations. Newest at the bottom.

---

## 2026-09-14 — Wiki initialized

- Created the wiki structure: `raw/` + `wiki/` under `memory/`.
- Added `wiki/index.md` (table of contents) and this log.
- `raw/README.md` placed as the operating manual.
- No knowledge pages yet — ready for the first source ingestion.

## 2026-09-16 — Ingested Live Preview & Infrastructure Documentation

- Ingested sources `raw/implementation-plan.md` and `raw/walkthrough.md`.
- Created summary page: `wiki/live-preview-pipeline.md`.
- Created concept pages:
  - `wiki/live-preview-bridge.md` (WebSocket VM Service bridge, debouncer, control RPCs).
  - `wiki/hot-reload-optimization.md` (JIT flags, incremental `.dill` caching, scoped file watchers).
  - `wiki/material-3-design-tokens.md` (tonal seeds, 4pt spacing scale, border radii, shadow elevations).
  - `wiki/adaptive-theme-system.md` (adaptive M3 themes, Google Fonts type ramp, Riverpod theme mode state).
  - `wiki/responsive-layout-architecture.md` (breakpoints scale, `ResponsiveLayout`, `AdaptiveContainer`, `ResponsiveFlex`).
  - `wiki/dev-preview-hud.md` (real-time 60/120 FPS metrics, frame timing, layout bounds, repaint rainbow, viewport switcher).
  - `wiki/flutter-codebase-fixes.md` (diagnostics and resolutions for 11 compiler errors and linter issues).
- Updated `wiki/index.md` with 8 new pages and tracked sources.