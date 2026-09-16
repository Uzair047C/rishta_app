import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';

import '../../core/models.dart';
import '../../core/providers.dart';
import '../../core/theme.dart';
import '../../core/widgets.dart';

/// Profile creation. Interest and language selection is a fixed tag set from the
/// backend — no free-text entry, which is what keeps overlap scoring computable.
class ProfileFormScreen extends ConsumerStatefulWidget {
  const ProfileFormScreen({super.key, required this.onNext});

  final VoidCallback onNext;

  @override
  ConsumerState<ProfileFormScreen> createState() => _ProfileFormScreenState();
}

class _ProfileFormScreenState extends ConsumerState<ProfileFormScreen> with FormProgress {
  final _form = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _bio = TextEditingController();
  final _education = TextEditingController();
  final _profession = TextEditingController();
  final _location = TextEditingController();

  DateTime? _dob;
  String? _gender;
  String? _marital;
  Position? _position;
  final _interests = <int>{};
  final _languages = <int>{};

  @override
  void dispose() {
    _name.dispose();
    _bio.dispose();
    _education.dispose();
    _profession.dispose();
    _location.dispose();
    super.dispose();
  }

  /// yyyy-MM-dd. The server parses this into a date, and its trigger is what
  /// actually enforces the age floor.
  String? get _dobIso {
    final dob = _dob;
    if (dob == null) return null;
    final m = dob.month.toString().padLeft(2, '0');
    final d = dob.day.toString().padLeft(2, '0');
    return '${dob.year}-$m-$d';
  }

  Future<void> _pickDob() async {
    final now = DateTime.now();
    // The picker simply cannot reach an under-18 date, so the client-side age
    // gate from spec 1.2 is structural rather than a validation message.
    final latestAllowed = DateTime(now.year - 18, now.month, now.day);
    final picked = await showDatePicker(
      context: context,
      initialDate: DateTime(now.year - 25, now.month, now.day),
      firstDate: DateTime(now.year - 100),
      lastDate: latestAllowed,
      helpText: 'Your date of birth',
    );
    if (picked != null) setState(() => _dob = picked);
  }

  /// Coordinates are optional: the feed shows profiles it cannot measure rather
  /// than emptying itself, so a denied permission degrades instead of blocking.
  Future<void> _useCurrentLocation() async {
    fail();
    try {
      if (!await Geolocator.isLocationServiceEnabled()) {
        fail('Turn on location services to use distance filters.');
        return;
      }
      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.denied || permission == LocationPermission.deniedForever) {
        fail('Location permission denied. You can still set your city manually.');
        return;
      }
      final position = await Geolocator.getCurrentPosition();
      if (mounted) setState(() => _position = position);
    } catch (_) {
      if (mounted) fail('Could not read your location.');
    }
  }

  Future<void> _save() async {
    if (!_form.currentState!.validate()) return;
    if (_dob == null) {
      fail('Please choose your date of birth.');
      return;
    }
    if (_interests.isEmpty) {
      fail('Pick at least one interest so we can match you well.');
      return;
    }

    await progress(() async {
      await ref.read(myProfileProvider.notifier).save({
        'name': _name.text.trim(),
        'gender': _gender,
        'dob': _dobIso,
        'location': _location.text.trim(),
        if (_position != null) 'lat': _position!.latitude,
        if (_position != null) 'lng': _position!.longitude,
        'bio': _bio.text.trim(),
        'education': _education.text.trim(),
        'profession': _profession.text.trim(),
        if (_marital != null) 'maritalStatus': _marital,
        'interestIds': _interests.toList(),
        'languageIds': _languages.toList(),
      });
      if (mounted) widget.onNext();
    });
  }

  @override
  Widget build(BuildContext context) {
    final tags = ref.watch(tagsProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Your profile')),
      body: AsyncView(
        value: tags,
        onRetry: () => ref.invalidate(tagsProvider),
        builder: (data) => Form(
          key: _form,
          child: ListView(
            padding: const EdgeInsets.all(Tokens.spaceMd),
            children: [
              TextFormField(
                controller: _name,
                textCapitalization: TextCapitalization.words,
                decoration: const InputDecoration(labelText: 'Name'),
                validator: (v) => (v == null || v.trim().isEmpty) ? 'Please enter your name.' : null,
              ),
              const SizedBox(height: Tokens.spaceMd),

              _DobField(dob: _dob, onTap: _pickDob),
              const SizedBox(height: Tokens.spaceMd),

              DropdownButtonFormField<String>(
                initialValue: _gender,
                decoration: const InputDecoration(labelText: 'Gender'),
                items: const [
                  DropdownMenuItem(value: 'male', child: Text('Male')),
                  DropdownMenuItem(value: 'female', child: Text('Female')),
                  DropdownMenuItem(value: 'other', child: Text('Other')),
                ],
                onChanged: (v) => setState(() => _gender = v),
                validator: (v) => v == null ? 'Please select your gender.' : null,
              ),
              const SizedBox(height: Tokens.spaceMd),

              TextFormField(
                controller: _location,
                textCapitalization: TextCapitalization.words,
                decoration: const InputDecoration(labelText: 'City', hintText: 'Lahore'),
              ),
              const SizedBox(height: Tokens.spaceSm),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: _useCurrentLocation,
                      icon: Icon(_position == null ? Icons.my_location : Icons.check_circle_outline),
                      label: Text(_position == null ? 'Use my location' : 'Location set'),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: Tokens.spaceMd),

              DropdownButtonFormField<String>(
                initialValue: _marital,
                decoration: const InputDecoration(labelText: 'Marital status'),
                items: const [
                  DropdownMenuItem(value: 'never_married', child: Text('Never married')),
                  DropdownMenuItem(value: 'divorced', child: Text('Divorced')),
                  DropdownMenuItem(value: 'widowed', child: Text('Widowed')),
                ],
                onChanged: (v) => setState(() => _marital = v),
              ),
              const SizedBox(height: Tokens.spaceMd),

              TextFormField(
                controller: _bio,
                maxLines: 4,
                maxLength: 1000,
                decoration: const InputDecoration(labelText: 'About you', alignLabelWithHint: true),
              ),
              const SizedBox(height: Tokens.spaceSm),

              TextFormField(
                controller: _education,
                decoration: const InputDecoration(labelText: 'Education (optional)'),
              ),
              const SizedBox(height: Tokens.spaceMd),

              TextFormField(
                controller: _profession,
                decoration: const InputDecoration(labelText: 'Profession (optional)'),
              ),
              const SizedBox(height: Tokens.spaceLg),

              const SectionHeader('Interests'),
              _TagPicker(
                tags: data.interests,
                selected: _interests,
                onToggle: (id, on) => setState(() => on ? _interests.add(id) : _interests.remove(id)),
              ),
              const SizedBox(height: Tokens.spaceLg),

              const SectionHeader('Languages'),
              _TagPicker(
                tags: data.languages,
                selected: _languages,
                onToggle: (id, on) => setState(() => on ? _languages.add(id) : _languages.remove(id)),
              ),
              const SizedBox(height: Tokens.spaceXl),

              if (error != null) ...[
                ErrorText(error!),
                const SizedBox(height: Tokens.spaceMd),
              ],

              FilledButton(
                onPressed: busy ? null : _save,
                child: Text(busy ? 'Saving…' : 'Continue'),
              ),
              const SizedBox(height: Tokens.spaceLg),
            ],
          ),
        ),
      ),
    );
  }
}

class _DobField extends StatelessWidget {
  const _DobField({required this.dob, required this.onTap});

  final DateTime? dob;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Semantics(
        button: true,
        label: dob == null
            ? 'Date of birth, not set'
            : 'Date of birth ${dob!.day}/${dob!.month}/${dob!.year}',
        child: InkWell(
          onTap: onTap,
          borderRadius: const BorderRadius.all(Radius.circular(Tokens.radiusMd)),
          child: InputDecorator(
            decoration: const InputDecoration(
              labelText: 'Date of birth',
              suffixIcon: Icon(Icons.calendar_today_outlined),
            ),
            child: Text(
              dob == null
                  ? 'Select your date of birth'
                  : '${dob!.day}/${dob!.month}/${dob!.year}',
            ),
          ),
        ),
      );
}

class _TagPicker extends StatelessWidget {
  const _TagPicker({required this.tags, required this.selected, required this.onToggle});

  final List<Tag> tags;
  final Set<int> selected;
  final void Function(int id, bool on) onToggle;

  @override
  Widget build(BuildContext context) => Wrap(
        spacing: Tokens.spaceSm,
        runSpacing: Tokens.spaceSm,
        children: [
          for (final tag in tags)
            FilterChip(
              label: Text(tag.label),
              selected: selected.contains(tag.id),
              // selected/focused are announced automatically once the chip has a
              // label, so no extra Semantics wrapper is needed here.
              onSelected: (on) => onToggle(tag.id, on),
            ),
        ],
      );
}
