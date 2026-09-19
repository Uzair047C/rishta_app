import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../../core/providers.dart';
import '../../core/storage.dart';
import '../../core/theme.dart';
import '../../core/widgets.dart';

/// Photo step. Spec 1.4: minimum 3 photos required to continue.
class PhotosScreen extends ConsumerStatefulWidget {
  const PhotosScreen({super.key, required this.onNext});

  final VoidCallback onNext;

  @override
  ConsumerState<PhotosScreen> createState() => _PhotosScreenState();
}

class _PhotosScreenState extends ConsumerState<PhotosScreen> with FormProgress {
  Future<void> _add({required bool primary}) async {
    final picked = await ImagePicker().pickImage(
      source: ImageSource.gallery,
      maxWidth: 1600,
      maxHeight: 1600,
      imageQuality: 85,
    );
    if (picked == null) return;

    // Client-side resolution check
    final bytes = await File(picked.path).readAsBytes();
    final codec = await ui.instantiateImageCodec(bytes);
    final frame = await codec.getNextFrame();
    final width = frame.image.width;
    final height = frame.image.height;

    if (width < 480 || height < 480) {
      if (mounted) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          showDialog(
            context: context,
            builder: (_) => AlertDialog(
              backgroundColor: Tokens.tanCard,
              title: Text('Something went wrong', style: TextStyle(color: Tokens.pinkDeep)),
              content: Text('Please provide a larger photo', style: TextStyle(color: Tokens.pinkDeep)),
              actions: [
                TextButton(onPressed: () => Navigator.pop(context), child: const Text('OK', style: TextStyle(color: Tokens.pink))),
              ],
            ),
          );
        });
      }
      return;
    }

    await progress(() async {
      final profile = ref.read(myProfileProvider).valueOrNull;
      final url = await Storage.upload(
        Storage.pathFor(profile?.userId ?? 'unknown', 'profiles'),
        File(picked.path),
      );
      await ref.read(myProfileProvider.notifier).addPhoto(url, makePrimary: primary);
      // The server re-opens verification when the primary photo changes, so the
      // caller must re-check status rather than assume the old verdict stands.
      ref.invalidate(verificationProvider);
    });
  }

  @override
  Widget build(BuildContext context) {
    final profile = ref.watch(myProfileProvider);
    final gender = profile.valueOrNull?.gender ?? '';

    return Scaffold(
      appBar: AppBar(title: const Text('Add your profile photos')),
      body: AsyncView(
        value: profile,
        onRetry: () => ref.invalidate(myProfileProvider),
        builder: (data) {
          final photos = data.photos;
          final ready = photos.length >= 3;

          return ListView(
            padding: const EdgeInsets.all(Tokens.spaceMd),
            children: [
              Text(
                'You need to upload at least 3 photos to continue completing your profile. You can change them later',
                style: TextStyle(color: Colors.brown.shade500),
              ),
              const SizedBox(height: Tokens.spaceMd),

              GridView.count(
                crossAxisCount: 3,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                mainAxisSpacing: Tokens.spaceSm,
                crossAxisSpacing: Tokens.spaceSm,
                children: [
                  for (var i = 0; i < photos.length; i++)
                    _PhotoTile(
                      url: photos[i],
                      isPrimary: i == 0,
                      label: i == 0 ? 'Primary photo' : 'Photo ${i + 1}',
                      gender: i == 0 ? gender : null,
                    ),
                  if (photos.length < 6)
                    _AddTile(
                      busy: busy,
                      label: photos.isEmpty ? 'Add photo' : 'Add another',
                      onTap: () => _add(primary: photos.isEmpty),
                    ),
                ],
              ),

              const SizedBox(height: Tokens.spaceLg),
              if (error != null) ...[
                ErrorText(error!),
                const SizedBox(height: Tokens.spaceMd),
              ],

              FilledButton(
                onPressed: ready && !busy ? widget.onNext : null,
                style: FilledButton.styleFrom(
                  minimumSize: const Size.fromHeight(52),
                  backgroundColor: Tokens.pink,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Tokens.radiusMd)),
                ),
                child: const Text('Add photos', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
              ),
              const SizedBox(height: Tokens.spaceLg),
            ],
          );
        },
      ),
    );
  }
}

class _PhotoTile extends StatelessWidget {
  const _PhotoTile({
    required this.url,
    required this.isPrimary,
    required this.label,
    this.gender,
  });

  final String url;
  final bool isPrimary;
  final String label;
  final String? gender;

  @override
  Widget build(BuildContext context) => Stack(
        fit: StackFit.expand,
        children: [
          ClipRRect(
            borderRadius: const BorderRadius.all(Radius.circular(Tokens.radiusSm)),
            child: ProfilePhoto(url: url, label: label),
          ),
          if (isPrimary && gender != null)
            Positioned(
              bottom: Tokens.spaceXs,
              right: Tokens.spaceXs,
              child: Chip(
                label: Text(
                  gender!,
                  style: const TextStyle(color: Colors.white, fontSize: 10),
                ),
                backgroundColor: Tokens.pink,
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              ),
            ),
        ],
      );
}

class _AddTile extends StatelessWidget {
  const _AddTile({required this.busy, required this.label, required this.onTap});

  final bool busy;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Semantics(
        button: true,
        label: label,
        child: InkWell(
          onTap: busy ? null : onTap,
          borderRadius: const BorderRadius.all(Radius.circular(Tokens.radiusSm)),
          child: DecoratedBox(
            decoration: BoxDecoration(
              borderRadius: const BorderRadius.all(Radius.circular(Tokens.radiusSm)),
              border: Border.all(color: Theme.of(context).colorScheme.outlineVariant),
            ),
            child: Center(
              child: busy
                  ? const SizedBox.square(dimension: 20, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.add_a_photo_outlined),
            ),
          ),
        ),
      );
}
