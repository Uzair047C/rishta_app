import 'package:flutter/material.dart';

import '../constants/breakpoints.dart';

/// Builder callback signature providing both context and active box constraints.
typedef ResponsiveWidgetBuilder = Widget Function(
  BuildContext context,
  BoxConstraints constraints,
);

/// Multi-breakpoint responsive builder adapting dynamically to Mobile, Tablet, and Desktop layouts.
class ResponsiveLayout extends StatelessWidget {
  const ResponsiveLayout({
    super.key,
    required this.mobile,
    this.tablet,
    this.desktop,
  });

  final ResponsiveWidgetBuilder mobile;
  final ResponsiveWidgetBuilder? tablet;
  final ResponsiveWidgetBuilder? desktop;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final screenType = Breakpoints.fromWidth(constraints.maxWidth);

        if (screenType == ScreenType.desktop || screenType == ScreenType.ultraWide) {
          if (desktop != null) return desktop!(context, constraints);
          if (tablet != null) return tablet!(context, constraints);
          return mobile(context, constraints);
        }

        if (screenType == ScreenType.tablet) {
          if (tablet != null) return tablet!(context, constraints);
          return mobile(context, constraints);
        }

        return mobile(context, constraints);
      },
    );
  }
}

/// Adaptive container that centers content and enforces max readability constraints
/// across larger screens, eliminating horizontal overflow.
class AdaptiveContainer extends StatelessWidget {
  const AdaptiveContainer({
    super.key,
    required this.child,
    this.maxWidth,
    this.padding,
    this.alignment = Alignment.topCenter,
  });

  final Widget child;
  final double? maxWidth;
  final EdgeInsetsGeometry? padding;
  final AlignmentGeometry alignment;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final screenType = Breakpoints.fromWidth(constraints.maxWidth);
        final defaultMaxWidth = switch (screenType) {
          ScreenType.mobile => double.infinity,
          ScreenType.tablet => Breakpoints.maxContentWidthTablet,
          ScreenType.desktop => Breakpoints.maxContentWidthDesktop,
          ScreenType.ultraWide => Breakpoints.maxContentWidthDesktop,
        };

        final effectiveMaxWidth = maxWidth ?? defaultMaxWidth;
        final horizontalMargin = Breakpoints.marginOf(context);

        return Align(
          alignment: alignment,
          child: ConstrainedBox(
            constraints: BoxConstraints(
              maxWidth: effectiveMaxWidth,
            ),
            child: Padding(
              padding: padding ?? EdgeInsets.symmetric(horizontal: horizontalMargin),
              child: child,
            ),
          ),
        );
      },
    );
  }
}

/// Dynamic value resolver that returns a tailored value based on the current screen size.
class ResponsiveValue<T> {
  const ResponsiveValue({
    required this.mobile,
    this.tablet,
    this.desktop,
  });

  final T mobile;
  final T? tablet;
  final T? desktop;

  T resolve(BuildContext context) {
    final screenType = Breakpoints.of(context);
    if (screenType.isDesktop && desktop != null) return desktop!;
    if (screenType.isTablet && tablet != null) return tablet!;
    return mobile;
  }
}

/// Adapts between Row and Column based on screen width with zero-overflow wrapping.
class ResponsiveFlex extends StatelessWidget {
  const ResponsiveFlex({
    super.key,
    required this.children,
    this.spacing = 16.0,
    this.crossAxisAlignment = CrossAxisAlignment.start,
    this.mainAxisAlignment = MainAxisAlignment.start,
    this.collapseBreakpoint = Breakpoints.tabletMin,
  });

  final List<Widget> children;
  final double spacing;
  final CrossAxisAlignment crossAxisAlignment;
  final MainAxisAlignment mainAxisAlignment;
  final double collapseBreakpoint;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final isRow = constraints.maxWidth >= collapseBreakpoint;

        if (isRow) {
          return Row(
            mainAxisAlignment: mainAxisAlignment,
            crossAxisAlignment: crossAxisAlignment,
            children: _intersperse(children, SizedBox(width: spacing)),
          );
        }

        return Column(
          mainAxisAlignment: mainAxisAlignment,
          crossAxisAlignment: crossAxisAlignment,
          children: _intersperse(children, SizedBox(height: spacing)),
        );
      },
    );
  }

  List<Widget> _intersperse(List<Widget> list, Widget separator) {
    if (list.isEmpty) return const [];
    final result = <Widget>[];
    for (int i = 0; i < list.length; i++) {
      result.add(list[i]);
      if (i < list.length - 1) {
        result.add(separator);
      }
    }
    return result;
  }
}
