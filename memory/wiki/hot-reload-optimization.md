# Hot Reload Optimization

**Summary**: Compiler daemon, incremental compilation caching, and scoped file-watcher rules designed to eliminate rebuild overhead.

**Sources**: `raw/implementation-plan.md`, `raw/walkthrough.md`

**Last updated**: 2026-09-16

---

## Compiler Daemon & Flags

The runner profiles in `.antigravity/launch.json` and `.vscode/launch.json` supply optimal flags for Flutter JIT execution `(source: walkthrough.md)`:
- `--web-renderer canvaskit`: CanvasKit Skia engine for Flutter Web with smooth animations and accurate text layout `(source: walkthrough.md)`.
- `--hot-reload-on-save`: Automatic reload dispatch upon file writes `(source: implementation-plan.md)`.
- `--enable-experiment=non-nullable`: Explicit sound null safety checks `(source: implementation-plan.md)`.
- `--enable-vm-service=8181` and `--vm-service-port=8181`: Fixes the Dart VM Service port for IDE bridges `(source: walkthrough.md)`.
- `--track-widget-creation`: Necessary for widget inspector overlays and structural hot reload preservation `(source: implementation-plan.md)`.

## Incremental Build Caching

Incremental compilation state is preserved on disk using:
```bash
--cache-dir=.dart_tool/flutter_build/dill_cache
```
Pre-launch tasks in `tasks.json` ensure this directory exists before compilation starts `(source: walkthrough.md)`. Subsequent hot reloads compile only the delta diff into the kernel binary, maintaining sub-100ms response times `(source: implementation-plan.md)`.

## Scoped Watcher Exclusions

To prevent rebuild storms and unnecessary I/O overhead, `files.watcherExclude` in `.antigravity/settings.json` excludes non-source directories `(source: walkthrough.md)`:
- `.git/**`, `.dart_tool/**`, `build/**`
- `backend/**`, `memory/**`
- `android/**`, `ios/**`, `windows/**`, `linux/**`, `macos/**`, `web/**`

File watching is strictly scoped to `lib/**` and `assets/**` `(source: implementation-plan.md)`.

## Related pages

- [[live-preview-pipeline]]
- [[live-preview-bridge]]
- [[dev-preview-hud]]
