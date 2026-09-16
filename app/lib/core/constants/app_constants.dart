import 'package:flutter/material.dart';

/// Performance and interaction constants for 60/120 FPS frame timing and accessibility.
abstract final class AppConstants {
  // Accessibility & interaction targets
  static const double minTouchTarget = 48.0;
  static const double minButtonHeight = 52.0;

  // Frame timing benchmarks (milliseconds)
  static const double targetFrameTime60Fps = 16.666;
  static const double targetFrameTime120Fps = 8.333;
  static const double jankWarningThreshold = 18.0;

  // Animation timing
  static const Duration durationFast = Duration(milliseconds: 150);
  static const Duration durationNormal = Duration(milliseconds: 250);
  static const Duration durationSlow = Duration(milliseconds: 400);

  // Standard curves
  static const Curve standardCurve = Curves.easeOutCubic;
  static const Curve emphasizedCurve = Curves.easeInOutCubicEmphasized;

  // Image & network cache limits (prevents raster memory leaks)
  static const int maxMemCacheWidth = 1080;
  static const int maxMemCacheHeight = 1920;
  static const int maxThumbnailMemCacheWidth = 320;
}
