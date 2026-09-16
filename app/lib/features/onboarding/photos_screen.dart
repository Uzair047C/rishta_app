import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../../core/providers.dart';
import '../../core/storage.dart';
import '../../core/theme.dart';
import '../../core/widgets.dart';

/// Photo step. Spec 1.2: minimum one photo, three to six recommended.
class PhotosScreen extends ConsumerStatefulWidget {
  const PhotosScreen({super.key, required this.onNext});

  final VoidCallback onNext;

  @override
  ConsumerState<PhotosScreen> createState() => _PhotosScreenState();
}

class _PhotosScreenState extends ConsumerState<PhotosScreen> {
  bool _busy = false;
  String? _error;

  Future<void> _add({required bool primary}) async {
    final picked = await ImagePicker().pickImage(
      source: ImageSource.gallery,
      maxWidth: 1600,
      maxHeight: 1600,
      imageQuality: 85,
    );
    if (picked == null) return;

    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final profile = ref.read(myProfileProvider).valueOrNull;
      final url = await Storage.upload(
        Storage.pathFor(profile?.userId ?? 'unknown', 'profiles'),
        File(picked.path),
      );
      await ref.read(myProfileProvider.notifier).addPhoto(url, makePrimary: primary);
      // The server re-opens verification when the primary photo changes, so the
      // caller must re-check status rather than assume the old verdict stands.
      ref.invalidate(verificationProvider);
    } catch (e) {
      if (mounted) setState(() => _error = messageFor(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final profile = ref.watch(myProfileProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Your photos')),
      body: AsyncView(
        value: profile,
        onRetry: () => ref.invalidate(myProfileProvider),
        builder: (data) {
          final photos = data.photos;
          final enough = photos.isNotEmpty;

          return ListView(
            padding: const EdgeInsets.all(Tokens.spaceMd),
            children: [
              Text(
                enough
                    ? 'Add a few more so people get a sense of you.'
                    : 'Add at least one photo to continue.',
                style: Theme.of(context).textTheme.bodyMedium,
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
                    ),
                  if (photos.length < 6)
                    _AddTile(
                      busy: _busy,
                      label: photos.isEmpty ? 'Add photo' : 'Add another',
                      onTap: () => _add(primary: photos.isEmpty),
                    ),
                ],
              ),

              const SizedBox(height: Tokens.spaceLg),
              if (!enough && photos.isNotEmpty)
                const Text('Something went wrong saving that photo.'),

              if (_error != null) ...[
                Semantics(
                  liveRegion: true,
                  child: Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                ),
                const SizedBox(height: Tokens.spaceMd),
              ],

              FilledButton(
                onPressed: enough && !_busy ? widget.onNext : null,
                child: const Text('Continue'),
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
  const _PhotoTile({required this.url, required this.isPrimary, required this.label});

  final String url;
  final bool isPrimary;
  final String label;

  @override
  Widget build(BuildContext context) => Stack(
        fit: StackFit.expand,
        children: [
          ClipRRect(
            borderRadius: const BorderRadius.all(Radius.circular(Tokens.radiusSm)),
            child: ProfilePhoto(url: url, label: label),
          ),
          if (isPrimary)
            Positioned(
              left: 4,
              top: 4,
              child: Semantics(
                label: 'This is your primary photo',
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  decoration: BoxDecoration(
                    color: Theme.of(context).colorScheme.primary,
                    borderRadius: const BorderRadius.all(Radius.circular(Tokens.radiusSm)),
                  ),
                  child: Text(
                    'Main',
                    style: TextStyle(
                      fontSize: 10,
                      color: Theme.of(context).colorScheme.onPrimary,
                    ),
                  ),
                ),
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
