import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/scheduler.dart';

import '../constants/app_constants.dart';
import '../theme/tokens.dart';

/// Performance and Live Preview HUD overlay.
/// Only active in debug/profile mode; in release mode it renders `child` with 0 overhead.
class DevPreviewOverlay extends StatefulWidget {
  const DevPreviewOverlay({
    super.key,
    required this.child,
    this.onToggleTheme,
    this.isDarkMode = false,
  });

  final Widget child;
  final VoidCallback? onToggleTheme;
  final bool isDarkMode;

  @override
  State<DevPreviewOverlay> createState() => _DevPreviewOverlayState();
}

enum DeviceSimulation {
  responsive('Fluid Desktop', null),
  mobile('Mobile (390x844)', Size(390, 844)),
  tablet('Tablet (820x1180)', Size(820, 1180));

  const DeviceSimulation(this.label, this.size);
  final String label;
  final Size? size;
}

class _DevPreviewOverlayState extends State<DevPreviewOverlay> {
  bool _showHud = true;
  bool _debugPaint = false;
  bool _repaintRainbow = false;
  DeviceSimulation _device = DeviceSimulation.responsive;

  // Real-time FPS & Frame timing metrics
  double _currentFps = 60.0;
  double _lastFrameMs = 16.0;
  int _droppedFrames = 0;
  final List<double> _frameHistory = [];

  void _onFrameTiming(List<FrameTiming> timings) {
    if (!mounted) return;
    for (final timing in timings) {
      final buildDurationMs = timing.buildDuration.inMicroseconds / 1000.0;
      final rasterDurationMs = timing.rasterDuration.inMicroseconds / 1000.0;
      final totalFrameMs = buildDurationMs + rasterDurationMs;

      _frameHistory.add(totalFrameMs);
      if (_frameHistory.length > 60) {
        _frameHistory.removeAt(0);
      }

      if (totalFrameMs > AppConstants.jankWarningThreshold) {
        _droppedFrames++;
      }

      final avgMs = _frameHistory.reduce((a, b) => a + b) / _frameHistory.length;
      final fps = (1000.0 / (avgMs > 0 ? avgMs : 16.666)).clamp(1.0, 120.0);

      setState(() {
        _lastFrameMs = totalFrameMs;
        _currentFps = fps;
      });
    }
  }

  @override
  void initState() {
    super.initState();
    if (kDebugMode) {
      SchedulerBinding.instance.addTimingsCallback(_onFrameTiming);
    }
  }

  @override
  void dispose() {
    if (kDebugMode) {
      SchedulerBinding.instance.removeTimingsCallback(_onFrameTiming);
    }
    super.dispose();
  }

  void _toggleLayoutBounds() {
    setState(() {
      _debugPaint = !_debugPaint;
      debugPaintSizeEnabled = _debugPaint;
    });
  }

  void _toggleRepaintRainbow() {
    setState(() {
      _repaintRainbow = !_repaintRainbow;
      debugRepaintRainbowEnabled = _repaintRainbow;
    });
  }

  @override
  Widget build(BuildContext context) {
    if (!kDebugMode) {
      return widget.child;
    }

    final simulatedSize = _device.size;
    final content = simulatedSize == null
        ? widget.child
        : Center(
            child: Container(
              width: simulatedSize.width,
              height: simulatedSize.height,
              clipBehavior: Clip.antiAlias,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(Tokens.radiusLg),
                border: Border.all(color: Colors.white24, width: 3),
                boxShadow: Tokens.shadowLevel3,
              ),
              child: widget.child,
            ),
          );

    return Material(
      type: MaterialType.transparency,
      child: Stack(
        fit: StackFit.expand,
        children: [
          content,
          if (_showHud) _buildFloatingDevHud(context),
          _buildHudToggleChip(),
        ],
      ),
    );
  }

  Widget _buildHudToggleChip() {
    return Positioned(
      top: 36,
      right: 16,
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: () => setState(() => _showHud = !_showHud),
          borderRadius: BorderRadius.circular(Tokens.radiusPill),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: BoxDecoration(
              color: Colors.black.withValues(alpha: 0.8),
              borderRadius: BorderRadius.circular(Tokens.radiusPill),
              border: Border.all(color: Colors.white24),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                _buildFpsDot(),
                const SizedBox(width: 6),
                Text(
                  '${_currentFps.toStringAsFixed(0)} FPS',
                  style: TextStyle(
                    color: _getFpsColor(),
                    fontSize: 12,
                    fontWeight: FontWeight.bold,
                    fontFamily: 'monospace',
                  ),
                ),
                const SizedBox(width: 4),
                Icon(
                  _showHud ? Icons.expand_less : Icons.tune,
                  color: Colors.white70,
                  size: 16,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildFpsDot() {
    return Container(
      width: 8,
      height: 8,
      decoration: BoxDecoration(
        color: _getFpsColor(),
        shape: BoxShape.circle,
      ),
    );
  }

  Color _getFpsColor() {
    if (_currentFps >= 55) return const Color(0xFF00E676);
    if (_currentFps >= 40) return const Color(0xFFFFB300);
    return const Color(0xFFFF5252);
  }

  Widget _buildFloatingDevHud(BuildContext context) {
    return Positioned(
      top: 80,
      right: 16,
      child: Container(
        width: 260,
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: const Color(0xEE181824),
          borderRadius: BorderRadius.circular(Tokens.radiusMd),
          border: Border.all(color: Colors.white12),
          boxShadow: Tokens.shadowLevel2,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              children: [
                const Icon(Icons.bolt, color: Color(0xFF8E2DE2), size: 16),
                const SizedBox(width: 6),
                const Expanded(
                  child: Text(
                    'DEV INSPECTOR HUD',
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 1.0,
                    ),
                  ),
                ),
                Text(
                  '${_lastFrameMs.toStringAsFixed(1)}ms',
                  style: const TextStyle(
                    color: Colors.white54,
                    fontSize: 11,
                    fontFamily: 'monospace',
                  ),
                ),
              ],
            ),
            const Divider(color: Colors.white10, height: 16),
            _buildHudAction(
              icon: Icons.border_all,
              label: 'Layout Bounds',
              active: _debugPaint,
              onTap: _toggleLayoutBounds,
            ),
            const SizedBox(height: 6),
            _buildHudAction(
              icon: Icons.color_lens_outlined,
              label: 'Repaint Rainbow',
              active: _repaintRainbow,
              onTap: _toggleRepaintRainbow,
            ),
            const SizedBox(height: 6),
            if (widget.onToggleTheme != null) ...[
              _buildHudAction(
                icon: widget.isDarkMode ? Icons.dark_mode : Icons.light_mode,
                label: widget.isDarkMode ? 'Theme: Dark' : 'Theme: Light',
                active: widget.isDarkMode,
                onTap: widget.onToggleTheme!,
              ),
              const SizedBox(height: 6),
            ],
            const SizedBox(height: 4),
            const Text(
              'VIEWPORT SIMULATION',
              style: TextStyle(
                color: Colors.white38,
                fontSize: 9,
                fontWeight: FontWeight.w600,
                letterSpacing: 0.5,
              ),
            ),
            const SizedBox(height: 6),
            Wrap(
              spacing: 6,
              runSpacing: 4,
              children: DeviceSimulation.values.map((dev) {
                final isSelected = _device == dev;
                return ChoiceChip(
                  label: Text(dev.label, style: const TextStyle(fontSize: 10)),
                  selected: isSelected,
                  selectedColor: const Color(0xFF8E2DE2),
                  onSelected: (_) => setState(() => _device = dev),
                  labelStyle: TextStyle(
                    color: isSelected ? Colors.white : Colors.white70,
                  ),
                  visualDensity: VisualDensity.compact,
                  materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                );
              }).toList(),
            ),
            if (_droppedFrames > 0) ...[
              const SizedBox(height: 8),
              Text(
                'Dropped Frames: $_droppedFrames',
                style: const TextStyle(
                  color: Color(0xFFFF8A80),
                  fontSize: 10,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildHudAction({
    required IconData icon,
    required String label,
    required bool active,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(Tokens.radiusSm),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
        decoration: BoxDecoration(
          color: active ? const Color(0xFF8E2DE2).withValues(alpha: 0.25) : Colors.white.withValues(alpha: 0.05),
          borderRadius: BorderRadius.circular(Tokens.radiusSm),
          border: Border.all(
            color: active ? const Color(0xFF8E2DE2) : Colors.transparent,
            width: 1,
          ),
        ),
        child: Row(
          children: [
            Icon(
              icon,
              size: 15,
              color: active ? const Color(0xFFB388FF) : Colors.white70,
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                label,
                style: TextStyle(
                  fontSize: 12,
                  color: active ? Colors.white : Colors.white70,
                  fontWeight: active ? FontWeight.w600 : FontWeight.normal,
                ),
              ),
            ),
            if (active)
              const Icon(Icons.check, size: 14, color: Color(0xFFB388FF)),
          ],
        ),
      ),
    );
  }
}
