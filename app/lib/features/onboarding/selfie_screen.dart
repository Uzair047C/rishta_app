import 'dart:io';

import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';
import '../../core/storage.dart';
import '../../core/theme.dart';
import '../../core/widgets.dart';

/// Live selfie capture for profile photo, in-app camera only.
class SelfieScreen extends ConsumerStatefulWidget {
  const SelfieScreen({
    super.key,
    required this.onDone,
    this.currentStep = 0,
    this.totalSteps = 14,
  });

  final VoidCallback onDone;
  final int currentStep;
  final int totalSteps;

  @override
  ConsumerState<SelfieScreen> createState() => _SelfieScreenState();
}

class _SelfieScreenState extends ConsumerState<SelfieScreen>
    with WidgetsBindingObserver, FormProgress {
  CameraController? _camera;

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
    } on CameraException catch (e) {
      if (mounted) {
        fail(e.code == 'CameraAccessDenied'
            ? 'Camera access is needed. Enable it in Settings and try again.'
            : 'Could not start the camera.');
      }
    }
  }

  Future<void> _capture() async {
    final camera = _camera;
    if (camera == null || !camera.value.isInitialized) return;

    await progress(() async {
      final shot = await camera.takePicture();
      final userId = ref.read(myProfileProvider).valueOrNull?.userId ?? 'unknown';
      final url = await Storage.upload(Storage.pathFor(userId, 'selfies'), File(shot.path));

      // Add as a profile photo (not verification)
      await ref.read(myProfileProvider.notifier).addPhoto(url, makePrimary: false);
      widget.onDone();
    });
  }

  @override
  Widget build(BuildContext context) {
    final camera = _camera;

    return Scaffold(
      appBar: AppBar(title: const Text('Take a selfie')),
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
                  'Take a selfie to add to your profile.',
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.bodyMedium,
                ),
                const SizedBox(height: Tokens.spaceMd),
                if (error != null) ...[
                  ErrorText(error!, textAlign: TextAlign.center),
                  const SizedBox(height: Tokens.spaceSm),
                ],
                FilledButton.icon(
                  onPressed: busy || camera == null ? null : _capture,
                  icon: const Icon(Icons.camera_alt),
                  label: Text(busy ? 'Saving…' : 'Take selfie'),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}