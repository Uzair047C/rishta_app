import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../../core/providers.dart';
import '../../core/storage.dart';
import '../../core/theme.dart';
import 'onboarding_scaffold.dart';

/// Photo upload grid (step 14) — 6 slots, min 3 required, client-side resolution check.
class PhotoGridScreen extends ConsumerStatefulWidget {
  const PhotoGridScreen({
    super.key,
    required this.onComplete,
    this.initialPhotos = const [],
    this.currentStep = 0,
    this.totalSteps = 14,
    this.helpText,
  });

  final void Function(List<String> photos) onComplete;
  final List<String> initialPhotos;
  final int currentStep;
  final int totalSteps;
  final String? helpText;

  @override
  ConsumerState<PhotoGridScreen> createState() => _PhotoGridScreenState();
}

class _PhotoGridScreenState extends ConsumerState<PhotoGridScreen> {
  final _picker = ImagePicker();
  final List<_PhotoSlot> _slots = [];
  bool _busy = false;
  String? _error;

  static const int _maxPhotos = 6;
  static const int _minPhotos = 3;
  static const int _minDimension = 480; // minimum width/height in pixels

  @override
  void initState() {
    super.initState();
    // Initialize slots from initial photos
    for (final url in widget.initialPhotos) {
      _slots.add(_PhotoSlot(url: url, isRemote: true));
    }
    // Fill remaining with empty slots
    while (_slots.length < _maxPhotos) {
      _slots.add(_PhotoSlot.empty());
    }
  }

  int get _filledCount => _slots.where((s) => s.hasImage).length;
  bool get _canContinue => _filledCount >= _minPhotos;

  Future<void> _addPhoto(int index) async {
    if (_busy) return;

    final picked = await _picker.pickImage(
      source: ImageSource.gallery,
      maxWidth: 1600,
      maxHeight: 1600,
      imageQuality: 85,
    );
    if (picked == null) return;

    // Client-side resolution check
    final bytes = await File(picked.path).readAsBytes();
    final codec = await instantiateImageCodec(bytes);
    final frame = await codec.getNextFrame();
    final width = frame.image.width;
    final height = frame.image.height;

    if (width < _minDimension || height < _minDimension) {
      if (mounted) {
        _showError('Photo too small. Minimum ${_minDimension}×${_minDimension}px. Yours: ${width}×${height}px');
      }
      return;
    }

    setState(() => _busy = true);
    try {
      final profile = ref.read(myProfileProvider).valueOrNull;
      final url = await Storage.upload(
        Storage.pathFor(profile?.userId ?? 'unknown', 'profiles'),
        File(picked.path),
      );

      setState(() {
        if (index < _slots.length) {
          _slots[index] = _PhotoSlot(url: url, isRemote: true);
        } else {
          _slots.add(_PhotoSlot(url: url, isRemote: true));
        }
        // Ensure we have empty slots at the end
        while (_slots.length < _maxPhotos && _slots.last.hasImage) {
          _slots.add(_PhotoSlot.empty());
        }
        _error = null;
      });
      ref.invalidate(verificationProvider);
    } catch (e) {
      if (mounted) _showError('Failed to upload photo: $e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _removePhoto(int index) {
    if (index >= _slots.length) return;
    setState(() {
      _slots.removeAt(index);
      // Add empty slot at the end to maintain count
      _slots.add(_PhotoSlot.empty());
    });
  }

  void _setPrimary(int index) {
    if (index >= _slots.length || !_slots[index].hasImage) return;
    setState(() {
      final primary = _slots.removeAt(index);
      _slots.insert(0, primary);
    });
  }

  void _showError(String msg) {
    setState(() => _error = msg);
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        backgroundColor: Tokens.tanCard,
        title: Text('Upload failed', style: TextStyle(color: Tokens.pinkDeep)),
        content: Text(msg, style: TextStyle(color: Tokens.pinkDeep)),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('OK', style: TextStyle(color: Tokens.pink))),
        ],
      ),
    );
  }

  void _showHelp(BuildContext context) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (_) => Container(
        padding: const EdgeInsets.all(Tokens.spaceLg),
        decoration: const BoxDecoration(
          color: Tokens.tanCard,
          borderRadius: BorderRadius.vertical(top: Radius.circular(Tokens.radiusLg)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(width: 40, height: 4, decoration: BoxDecoration(color: Tokens.pink.withValues(alpha: 0.3), borderRadius: BorderRadius.circular(4))),
            const SizedBox(height: Tokens.spaceMd),
            Text('Why this question?', style: Theme.of(context).textTheme.titleMedium?.copyWith(color: Tokens.pinkDeep, fontWeight: FontWeight.w700)),
            const SizedBox(height: Tokens.spaceMd),
            Text(widget.helpText!, style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: Tokens.pinkDeep), textAlign: TextAlign.center),
            const SizedBox(height: Tokens.spaceLg),
            FilledButton(onPressed: () => Navigator.pop(context), child: const Text('Got it')),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return OnboardingScaffold(
      currentStep: widget.currentStep,
      totalSteps: widget.totalSteps,
      onBack: () => Navigator.of(context).pop(),
      onHelp: widget.helpText != null ? () => _showHelp(context) : null,
      showProgress: true,
      bottomAction: FilledButton(
        onPressed: _canContinue && !_busy
            ? () => widget.onComplete(_slots.where((s) => s.hasImage).map((s) => s.url!).toList())
            : null,
        style: FilledButton.styleFrom(
          minimumSize: const Size.fromHeight(52),
          backgroundColor: Tokens.pink,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Tokens.radiusMd)),
        ),
        child: Text(_busy ? 'Uploading…' : 'Add photos', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Add your profile photos', style: Theme.of(context).textTheme.headlineSmall?.copyWith(color: Tokens.pinkDeep, fontWeight: FontWeight.w800)),
          const SizedBox(height: Tokens.spaceSm),
          Text('You need to upload at least $_minPhotos photos to continue. You can change them later.', style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: Colors.brown.shade500)),
          const SizedBox(height: Tokens.spaceLg),
          // Photo grid
          GridView.count(
            crossAxisCount: 3,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: Tokens.spaceSm,
            crossAxisSpacing: Tokens.spaceSm,
            childAspectRatio: 1,
            children: List.generate(_maxPhotos, (i) {
              final slot = _slots[i];
              if (slot.hasImage) {
                return _PhotoTile(
                  slot: slot,
                  index: i,
                  isPrimary: i == 0,
                  onRemove: () => _removePhoto(i),
                  onSetPrimary: () => _setPrimary(i),
                  busy: _busy,
                );
              } else {
                return _AddTile(
                  busy: _busy,
                  label: _filledCount == 0 ? 'Add photo' : 'Add another',
                  onTap: () => _addPhoto(i),
                );
              }
            }),
          ),
          const SizedBox(height: Tokens.spaceMd),
          // Photo guidelines link
          Center(
            child: TextButton.icon(
              onPressed: () {
                // Could navigate back to guidelines screen or show modal
              },
              icon: const Icon(Icons.info_outline, size: 16, color: Tokens.pink),
              label: const Text('Photo guidelines', style: TextStyle(color: Tokens.pink, fontSize: 13)),
            ),
          ),
          if (_error != null) ...[
            const SizedBox(height: Tokens.spaceMd),
            Text(_error!, style: TextStyle(color: Colors.red.shade700, fontSize: 13), textAlign: TextAlign.center),
          ],
        ],
      ),
    );
  }
}

class _PhotoSlot {
  const _PhotoSlot({this.url, this.isRemote = false, this.file});
  final String? url;
  final bool isRemote;
  final File? file;

  const _PhotoSlot.empty() : url = null, isRemote = false, file = null;

  bool get hasImage => url != null || file != null;
}

class _PhotoTile extends StatelessWidget {
  const _PhotoTile({
    super.key,
    required this.slot,
    required this.index,
    required this.isPrimary,
    required this.onRemove,
    required this.onSetPrimary,
    required this.busy,
  });

  final _PhotoSlot slot;
  final int index;
  final bool isPrimary;
  final VoidCallback onRemove;
  final VoidCallback onSetPrimary;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;

    return Stack(
      fit: StackFit.expand,
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(Tokens.radiusSm),
          child: slot.isRemote
              ? Image.network(
                  slot.url!,
                  fit: BoxFit.cover,
                  width: double.infinity,
                  height: double.infinity,
                  loadingBuilder: (context, child, progress) => progress == null
                      ? child
                      : Center(
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            value: progress.expectedTotalBytes != null ? progress.cumulativeBytesLoaded / progress.expectedTotalBytes! : null,
                            color: Tokens.pink,
                          ),
                        ),
                  errorBuilder: (_, __, ___) => Container(
                    color: scheme.surfaceContainerHighest,
                    child: const Icon(Icons.broken_image_outlined, color: Colors.grey),
                  ),
                )
              : Image.file(
                  slot.file!,
                  fit: BoxFit.cover,
                  width: double.infinity,
                  height: double.infinity,
                ),
        ),
        if (isPrimary)
          Positioned(
            left: 4,
            top: 4,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(
                color: Tokens.pink,
                borderRadius: BorderRadius.circular(Tokens.radiusSm),
              ),
              child: const Text('Main', style: TextStyle(fontSize: 10, color: Colors.white, fontWeight: FontWeight.w700)),
            ),
          ),
        Positioned(
          right: 4,
          top: 4,
          child: Row(
            children: [
              if (!isPrimary)
                _CircleButton(
                  icon: Icons.star_outline_rounded,
                  onPressed: busy ? null : onSetPrimary,
                  tooltip: 'Set as main',
                ),
              _CircleButton(
                icon: Icons.close_rounded,
                onPressed: busy ? null : onRemove,
                tooltip: 'Remove',
                color: Colors.red.shade400,
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _AddTile extends StatelessWidget {
  const _AddTile({super.key, required this.busy, required this.label, required this.onTap});

  final bool busy;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Semantics(
        button: true,
        label: label,
        child: Material(
          color: Tokens.tanCard,
          borderRadius: BorderRadius.circular(Tokens.radiusSm),
          child: InkWell(
            onTap: busy ? null : onTap,
            borderRadius: BorderRadius.circular(Tokens.radiusSm),
            child: DecoratedBox(
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(Tokens.radiusSm),
                border: Border.all(color: Tokens.pink.withValues(alpha: 0.3), width: 1.5, style: BorderStyle.solid),
              ),
              child: Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    busy
                        ? const SizedBox.square(dimension: 24, child: CircularProgressIndicator(strokeWidth: 2, color: Tokens.pink))
                        : const Icon(Icons.add_a_photo_outlined, size: 28, color: Tokens.pink),
                    const SizedBox(height: 4),
                    Text(label, style: TextStyle(fontSize: 11, color: Tokens.pinkDeep, fontWeight: FontWeight.w500)),
                  ],
                ),
              ),
            ),
          ),
        ),
      );
}

class _CircleButton extends StatelessWidget {
  const _CircleButton({super.key, required this.icon, required this.onPressed, this.tooltip, this.color});

  final IconData icon;
  final VoidCallback? onPressed;
  final String? tooltip;
  final Color? color;

  @override
  Widget build(BuildContext context) => Material(
        color: Colors.black.withValues(alpha: 0.4),
        shape: const CircleBorder(),
        child: InkWell(
          onTap: onPressed,
          borderRadius: BorderRadius.circular(16),
          child: Padding(
            padding: const EdgeInsets.all(6),
            child: Icon(icon, size: 16, color: color ?? Colors.white),
          ),
        ),
      );
}