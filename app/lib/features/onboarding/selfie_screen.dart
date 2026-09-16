import 'dart:io';

import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/models.dart';
import '../../core/providers.dart';
import '../../core/storage.dart';
import '../../core/theme.dart';
import '../../core/widgets.dart';

/// Spec 1.2 — live selfie capture, in-app camera only.
///
/// The gallery is not merely hidden here, it is unreachable: this widget holds a
/// [CameraController] and renders its preview with a shutter. There is no image
/// picker in this file, so no code path can substitute a stored photo.
class SelfieScreen extends ConsumerStatefulWidget {
  const SelfieScreen({super.key, required this.onDone});

  final VoidCallback onDone;

  @override
  ConsumerState<SelfieScreen> createState() => _SelfieScreenState();
}

class _SelfieScreenState extends ConsumerState<SelfieScreen> with WidgetsBindingObserver {
  CameraController? _camera;
  String? _sessionId;
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _start();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _camera?.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    final camera = _camera;
    if (camera == null || !camera.value.isInitialized) return;
    // The OS reclaims the camera when the app backgrounds; re-init on return.
    if (state == AppLifecycleState.inactive) {
      camera.dispose();
    } else if (state == AppLifecycleState.resumed) {
      _start();
    }
  }

  Future<void> _start() async {
    try {
      final cameras = await availableCameras();
      if (cameras.isEmpty) throw CameraException('no_camera', 'No camera on this device');
      final front = cameras.firstWhere(
        (c) => c.lensDirection == CameraLensDirection.front,
        orElse: () => cameras.first,
      );
      final controller = CameraController(front, ResolutionPreset.medium, enableAudio: false);
      await controller.initialize();
      if (!mounted) {
        await controller.dispose();
        return;
      }
      setState(() => _camera = controller);
      await _openLivenessSession();
    } on CameraException catch (e) {
      if (mounted) {
        setState(() => _error = e.code == 'CameraAccessDenied'
            ? 'Camera access is needed to verify you. Enable it in Settings and try again.'
            : 'Could not start the camera.');
      }
    }
  }

  /// Server-side liveness session. The face-match runs against its reference
  /// image, so a session must exist before a selfie is worth submitting.
  Future<void> _openLivenessSession() async {
    try {
      final res = await ref.read(apiProvider).post<Map<String, dynamic>>(
        '/verification/liveness-session',
        parse: (j) => j as Map<String, dynamic>,
      );
      if (mounted) setState(() => _sessionId = res['sessionId'] as String?);
    } catch (e) {
      // Non-fatal: the development passthrough has no session to open.
      if (mounted) setState(() => _sessionId = null);
    }
  }

  Future<void> _capture() async {
    final camera = _camera;
    if (camera == null || !camera.value.isInitialized) return;

    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final shot = await camera.takePicture();
      final userId = ref.read(myProfileProvider).valueOrNull?.userId ?? 'unknown';
      final url = await Storage.upload(Storage.pathFor(userId, 'selfies'), File(shot.path));

      await ref.read(verificationProvider.notifier).submit(
            livenessSessionId: _sessionId,
            selfieUrl: url,
          );

      final result = ref.read(verificationProvider).valueOrNull;
      if (!mounted) return;
      if (result?.isVerified ?? false) {
        widget.onDone();
      } else {
        setState(() => _error = 'We could not verify that photo. Make sure your face is well lit and clearly visible.');
      }
    } catch (e) {
      if (mounted) setState(() => _error = messageFor(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final camera = _camera;

    return Scaffold(
      appBar: AppBar(title: const Text('Verify it’s you')),
      body: Column(
        children: [
          Expanded(
            child: ColoredBox(
              color: Theme.of(context).colorScheme.surfaceContainerHighest,
              child: camera == null || !camera.value.isInitialized
                  ? const LoadingView()
                  : Semantics(
                      image: true,
                      label: 'Live camera preview',
                      child: Center(child: CameraPreview(camera)),
                    ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(Tokens.spaceMd),
            child: Column(
              children: [
                Text(
                  'Take a live selfie. We compare it with your main photo — this is what keeps Rishta free of fake profiles.',
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.bodyMedium,
                ),
                const SizedBox(height: Tokens.spaceMd),
                if (_error != null) ...[
                  Semantics(
                    liveRegion: true,
                    child: Text(
                      _error!,
                      textAlign: TextAlign.center,
                      style: TextStyle(color: Theme.of(context).colorScheme.error),
                    ),
                  ),
                  const SizedBox(height: Tokens.spaceSm),
                ],
                FilledButton.icon(
                  onPressed: _busy || camera == null ? null : _capture,
                  icon: const Icon(Icons.camera_alt),
                  label: Text(_busy ? 'Checking…' : 'Take selfie'),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Spec 1.2 — unverified accounts see this instead of the browsing feed.
class VerificationPendingScreen extends ConsumerWidget {
  const VerificationPendingScreen({super.key, required this.onRetry});

  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final status = ref.watch(verificationProvider);

    return Scaffold(
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(Tokens.spaceLg),
          child: AsyncView(
            value: status,
            onRetry: () => ref.invalidate(verificationProvider),
            builder: (value) => Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  value == VerificationStatus.failed ? Icons.error_outline : Icons.hourglass_top,
                  size: 48,
                  semanticLabel: value == VerificationStatus.failed ? 'Verification failed' : 'Verification pending',
                ),
                const SizedBox(height: Tokens.spaceMd),
                Text(
                  value == VerificationStatus.failed
                      ? 'We could not verify your selfie.'
                      : 'Your verification is being reviewed.',
                  style: Theme.of(context).textTheme.titleMedium,
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: Tokens.spaceSm),
                Text(
                  value == VerificationStatus.failed
                      ? 'Try again with good lighting and no glasses.'
                      : 'You will be able to browse as soon as it clears.',
                  style: Theme.of(context).textTheme.bodyMedium,
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: Tokens.spaceLg),
                if (value == VerificationStatus.failed)
                  FilledButton(onPressed: onRetry, child: const Text('Try again'))
                else
                  OutlinedButton(
                    onPressed: () => ref.invalidate(verificationProvider),
                    child: const Text('Check again'),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
