# Responsive Layout Architecture

**Summary**: Multi-breakpoint layout engine and container constraints that eliminate overflow across mobile, tablet, and desktop viewports.

**Sources**: `raw/implementation-plan.md`, `raw/walkthrough.md`

**Last updated**: 2026-09-16

---

## Breakpoints Hierarchy

Defined in `lib/core/constants/breakpoints.dart` `(source: walkthrough.md)`:

| Classification | Viewport Width Range | Target Devices | Grid Columns |
|---|---|---|---|
| `ScreenType.mobile` | < 600dp | Phones in portrait | 1 |
| `ScreenType.tablet` | 600dp – 1023dp | Tablets, large foldables | 2 |
| `ScreenType.desktop` | 1024dp – 1439dp | Desktops, laptops | 3 |
| `ScreenType.ultraWide` | ≥ 1440dp | High-resolution displays | 4 |

## Layout Primitives

Located in `lib/core/layout/responsive_layout.dart` `(source: walkthrough.md)`:

### `ResponsiveLayout`
Adapts based on local parent `BoxConstraints`:
```dart
ResponsiveLayout(
  mobile: (context, constraints) => MobileLayout(),
  tablet: (context, constraints) => TabletLayout(),
  desktop: (context, constraints) => DesktopLayout(),
)
```

### `AdaptiveContainer`
Centers content and enforces maximum readability widths on larger screens `(source: implementation-plan.md)`:
- Mobile: `double.infinity`
- Tablet: 768dp
- Desktop: 1140dp
Eliminates horizontal text stretching and layout overflow on wide monitors `(source: walkthrough.md)`.

### `ResponsiveFlex`
Switches dynamically between `Row` (on desktop/tablet) and `Column` (on mobile) with spacing separation and zero-overflow wrapping `(source: walkthrough.md)`.

### Navigation Shell Adaptation
In `lib/main.dart`, `HomeShell` queries `Breakpoints.of(context)`:
- Uses `NavigationBar` at the bottom for mobile `(source: walkthrough.md)`.
- Switches to `NavigationRail` with vertical divider for tablet/desktop `(source: walkthrough.md)`.

## Related pages

- [[material-3-design-tokens]]
- [[dev-preview-hud]]
- [[live-preview-pipeline]]
