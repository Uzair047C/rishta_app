# Adaptive Theme System

**Summary**: Material 3 theme generation with dynamic light/dark mode adaptation, typography ramping, and cohesive component theming.

**Sources**: `raw/implementation-plan.md`, `raw/walkthrough.md`

**Last updated**: 2026-09-16

---

## Overview

The theme system (`lib/core/theme/app_theme.dart`) generates cohesive Material 3 `ThemeData` instances for both `Brightness.light` and `Brightness.dark` based on the brand seed `(source: walkthrough.md)`.

## Typography Architecture

Typography is backed by Google Fonts, combining two distinct families `(source: implementation-plan.md)`:
- **Display & Headings**: Google Fonts Outfit (bold, geometric letterforms for titles and headers) `(source: walkthrough.md)`.
- **Body & Captions**: Google Fonts Inter (highly legible neutral grotesque for content and micro-copy) `(source: walkthrough.md)`.

## Component Theming

- **`CardThemeData`**: Zero elevation, surface container background, rounded borders (`Tokens.radiusMd`), and anti-aliased clipping `(source: walkthrough.md)`.
- **`FilledButtonThemeData`**: Minimum touch height 52dp (exceeding WCAG 48dp), rounded corners, semi-bold label styling `(source: walkthrough.md)`.
- **`InputDecorationTheme`**: Subtle tinted fill, outline border with primary focus highlights `(source: walkthrough.md)`.
- **`NavigationBarThemeData`**: Material 3 pill selection indicator with dynamic label styling `(source: walkthrough.md)`.
- **`BottomSheetThemeData`**: Elevated drag handles and rounded top corners (`Tokens.radiusLg`) `(source: walkthrough.md)`.

## Dynamic Theme Switching

State is managed by Riverpod:
```dart
final themeModeProvider = StateProvider<ThemeMode>((ref) => ThemeMode.system);
```
The root `RishtaApp` watches this provider and updates dynamically without requiring an application restart `(source: walkthrough.md)`.

## Related pages

- [[material-3-design-tokens]]
- [[dev-preview-hud]]
- [[responsive-layout-architecture]]
