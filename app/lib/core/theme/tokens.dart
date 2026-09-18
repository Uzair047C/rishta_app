import 'package:flutter/material.dart';

/// Design tokens. Every colour, gap, radius and shadow in the app resolves through here.
abstract final class Tokens {
  /// Primary brand seed — dusty rose pink. Material 3 derives the full tonal palette.
  static const seed = Color(0xFFD4748C);

  // Secondary accent — warm terracotta tan
  static const secondarySeed = Color(0xFFC49A72);
  // Tertiary — soft blush
  static const tertiarySeed = Color(0xFFE8A0B0);

  // Tan surface palette for direct use
  static const tanBase = Color(0xFFF5E6D3);
  static const tanDark = Color(0xFFEDD5B8);
  static const tanCard = Color(0xFFFDF6EE);
  static const pink = Color(0xFFE50050); // Muzz iconic red-pink brand color
  static const pinkAccent = Color(0xFFD4748C);
  static const pinkLight = Color(0xFFF2B8C6);
  static const pinkDeep = Color(0xFFB05570);

  // Radii scale
  static const radiusXs = 4.0;
  static const radiusSm = 8.0;
  static const radiusMd = 16.0;
  static const radiusLg = 24.0;
  static const radiusXl = 32.0;
  static const radiusPill = 999.0;

  // 4pt spacing scale
  static const spaceXs = 4.0;
  static const spaceSm = 8.0;
  static const spaceMd = 16.0;
  static const spaceLg = 24.0;
  static const spaceXl = 32.0;
  static const space2Xl = 48.0;

  // Match card layout ratio
  static const cardAspect = 1 / 1.35;

  // Elevation & Shadows
  static const shadowLevel1 = [
    BoxShadow(
      color: Color(0x0F000000),
      blurRadius: 8,
      offset: Offset(0, 2),
    ),
  ];

  static const shadowLevel2 = [
    BoxShadow(
      color: Color(0x1A000000),
      blurRadius: 16,
      offset: Offset(0, 4),
    ),
  ];

  static const shadowLevel3 = [
    BoxShadow(
      color: Color(0x26000000),
      blurRadius: 24,
      offset: Offset(0, 8),
    ),
  ];
}
