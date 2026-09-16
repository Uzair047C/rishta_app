import 'package:flutter/material.dart';

/// Screen classification based on standard responsive design breakpoints.
enum ScreenType {
  mobile,
  tablet,
  desktop,
  ultraWide;

  bool get isMobile => this == ScreenType.mobile;
  bool get isTablet => this == ScreenType.tablet;
  bool get isDesktop => this == ScreenType.desktop || this == ScreenType.ultraWide;
  bool get isCompact => isMobile;
}

/// Strict responsive layout breakpoints and content width constraints.
abstract final class Breakpoints {
  /// Up to 599dp: phones in portrait and small screens.
  static const double mobileMax = 599.0;

  /// 600dp - 1023dp: tablets and phones in landscape.
  static const double tabletMin = 600.0;
  static const double tabletMax = 1023.0;

  /// 1024dp - 1439dp: desktop windows and laptops.
  static const double desktopMin = 1024.0;
  static const double desktopMax = 1439.0;

  /// 1440dp and above: large desktop displays and ultra-wide monitors.
  static const double ultraWideMin = 1440.0;

  // Maximum content readability widths
  static const double maxContentWidthMobile = 480.0;
  static const double maxContentWidthTablet = 768.0;
  static const double maxContentWidthDesktop = 1140.0;

  /// Determines the active screen type from [BuildContext] or width.
  static ScreenType of(BuildContext context) {
    final width = MediaQuery.sizeOf(context).width;
    return fromWidth(width);
  }

  static ScreenType fromWidth(double width) {
    if (width < tabletMin) return ScreenType.mobile;
    if (width <= tabletMax) return ScreenType.tablet;
    if (width <= desktopMax) return ScreenType.desktop;
    return ScreenType.ultraWide;
  }

  /// Adaptive horizontal margins for consistent viewport breathing room.
  static double marginOf(BuildContext context) {
    final type = of(context);
    return switch (type) {
      ScreenType.mobile => 16.0,
      ScreenType.tablet => 24.0,
      ScreenType.desktop => 32.0,
      ScreenType.ultraWide => 48.0,
    };
  }

  /// Adaptive column count for feeds, match cards, and media grids.
  static int gridColumnsOf(BuildContext context) {
    final type = of(context);
    return switch (type) {
      ScreenType.mobile => 1,
      ScreenType.tablet => 2,
      ScreenType.desktop => 3,
      ScreenType.ultraWide => 4,
    };
  }
}
