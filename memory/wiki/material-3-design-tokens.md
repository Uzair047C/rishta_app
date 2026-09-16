# Material 3 Design Tokens

**Summary**: Unified token system for brand colors, 4pt spacing scale, border radii, shadows, and typography hierarchies.

**Sources**: `raw/implementation-plan.md`, `raw/walkthrough.md`

**Last updated**: 2026-09-16

---

## Token Definition

All styling tokens reside in `lib/core/theme/tokens.dart` and are re-exported via `lib/core/theme.dart` and `lib/core/core.dart` `(source: walkthrough.md)`.

### Brand Color Seeds
- **Primary Seed**: `0xFF8E2DE2` (Electric Violet) `(source: implementation-plan.md)`.
- **Secondary Seed**: `0xFF4A00E0` (Deep Indigo) `(source: walkthrough.md)`.
- **Tertiary Seed**: `0xFFFF5252` (Coral Pink) `(source: walkthrough.md)`.

Material 3 generates full 13-tone tonal palettes automatically for light and dark themes using `ColorScheme.fromSeed` `(source: walkthrough.md)`.

### 4pt Spacing Scale
- `spaceXs`: 4.0dp
- `spaceSm`: 8.0dp
- `spaceMd`: 16.0dp
- `spaceLg`: 24.0dp
- `spaceXl`: 32.0dp
- `space2Xl`: 48.0dp `(source: walkthrough.md)`

### Corner Radii Scale
- `radiusXs`: 4.0dp
- `radiusSm`: 8.0dp
- `radiusMd`: 16.0dp (cards, inputs, buttons)
- `radiusLg`: 24.0dp (bottom sheets, dialogs)
- `radiusXl`: 32.0dp
- `radiusPill`: 999.0dp (chips, badges) `(source: walkthrough.md)`

### Shadow Elevations
- `shadowLevel1`: Subtle offset `(0, 2)` blur 8 for chips and floating buttons `(source: walkthrough.md)`.
- `shadowLevel2`: Offset `(0, 4)` blur 16 for dev HUD and floating panels `(source: walkthrough.md)`.
- `shadowLevel3`: Offset `(0, 8)` blur 24 for simulated device frames `(source: walkthrough.md)`.

## Related pages

- [[adaptive-theme-system]]
- [[responsive-layout-architecture]]
- [[live-preview-pipeline]]
