import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';

import '../../core/theme.dart';
import 'onboarding_scaffold.dart';

/// Location screen: city text input + GPS permission for radius filtering.
class LocationScreen extends ConsumerStatefulWidget {
  const LocationScreen({
    super.key,
    required this.onConfirm,
    this.initialCity,
    this.currentStep = 0,
    this.totalSteps = 14,
    this.helpText,
  });

  final void Function(String city, double? lat, double? lng) onConfirm;
  final String? initialCity;
  final int currentStep;
  final int totalSteps;
  final String? helpText;

  @override
  ConsumerState<LocationScreen> createState() => _LocationScreenState();
}

class _LocationScreenState extends ConsumerState<LocationScreen> {
  final _ctrl = TextEditingController();
  final _focusNode = FocusNode();
  bool _busy = false;
  String? _error;
  bool _permissionRequested = false;
  bool _permissionGranted = false;
  double? _lat;
  double? _lng;

  @override
  void initState() {
    super.initState();
    if (widget.initialCity != null) _ctrl.text = widget.initialCity!;
    _focusNode.requestFocus();
  }

  @override
  void dispose() {
    _ctrl.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  Future<void> _requestLocationPermission() async {
    setState(() => _permissionRequested = true);
    try {
      final status = await Geolocator.checkPermission();
      if (status == LocationPermission.denied || status == LocationPermission.deniedForever) {
        final result = await Geolocator.requestPermission();
        setState(() => _permissionGranted = result == LocationPermission.whileInUse || result == LocationPermission.always);
      } else {
        setState(() => _permissionGranted = status == LocationPermission.whileInUse || status == LocationPermission.always);
      }
      // Coordinates captured at grant time — the backend rounds to 2 decimals
      // and derives the geo column for radius filtering.
      if (_permissionGranted) {
        final pos = await Geolocator.getCurrentPosition();
        _lat = pos.latitude;
        _lng = pos.longitude;
      }
    } catch (_) {
      setState(() => _permissionGranted = false);
    }
  }

  void _submit() {
    final city = _ctrl.text.trim();
    if (city.isEmpty) {
      setState(() => _error = 'Please enter your city');
      return;
    }
    if (city.length < 2) {
      setState(() => _error = 'City name is too short');
      return;
    }
    setState(() => _error = null);
    setState(() => _busy = true);
    widget.onConfirm(city, _lat, _lng);
  }

  @override
  Widget build(BuildContext context) => OnboardingScaffold(
        currentStep: widget.currentStep,
        totalSteps: widget.totalSteps,
        onBack: () => Navigator.of(context).pop(),
        onHelp: widget.helpText != null ? () => _showHelp(context) : null,
        showProgress: true,
        bottomAction: FilledButton(
          onPressed: _busy ? null : _submit,
          style: FilledButton.styleFrom(
            minimumSize: const Size.fromHeight(52),
            backgroundColor: Tokens.pink,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Tokens.radiusMd)),
          ),
          child: Text(_busy ? 'Saving…' : 'Continue', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Where are you located?', style: Theme.of(context).textTheme.headlineSmall?.copyWith(color: Tokens.pinkDeep, fontWeight: FontWeight.w800)),
            const SizedBox(height: Tokens.spaceSm),
            Text('Your city helps with distance-based matching.', style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: Colors.brown.shade500)),
            const SizedBox(height: Tokens.spaceLg),
            TextField(
              controller: _ctrl,
              focusNode: _focusNode,
              textCapitalization: TextCapitalization.words,
              maxLength: 60,
              decoration: InputDecoration(
                hintText: 'Enter your city (e.g., London, Dubai)',
                hintStyle: TextStyle(color: Colors.brown.shade300),
                filled: true,
                fillColor: Tokens.tanCard,
                contentPadding: const EdgeInsets.symmetric(vertical: 16, horizontal: 16),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(Tokens.radiusMd), borderSide: BorderSide.none),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(Tokens.radiusMd),
                  borderSide: BorderSide(color: _error != null ? Colors.red : Tokens.pink.withValues(alpha: 0.25)),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(Tokens.radiusMd),
                  borderSide: const BorderSide(color: Tokens.pink, width: 2),
                ),
                errorText: _error,
                errorStyle: TextStyle(color: Colors.red.shade700),
              ),
            ),
            const SizedBox(height: Tokens.spaceLg),
            // GPS Permission section
            Container(
              padding: const EdgeInsets.all(Tokens.spaceMd),
              decoration: BoxDecoration(
                color: Tokens.tanCard,
                borderRadius: BorderRadius.circular(Tokens.radiusMd),
                border: Border.all(color: Tokens.pink.withValues(alpha: 0.25)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Icon(
                        _permissionGranted ? Icons.location_on : Icons.location_off,
                        color: _permissionGranted ? Tokens.pink : Colors.brown.shade400,
                        size: 24,
                      ),
                      const SizedBox(width: Tokens.spaceSm),
                      Expanded(
                        child: Text(
                          _permissionGranted ? 'Location access enabled' : 'Enable location for distance filtering',
                          style: TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.w600,
                            color: _permissionGranted ? Tokens.pinkDeep : Colors.brown.shade700,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: Tokens.spaceXs),
                  Text(
                    'Allowing location access lets us show matches by distance (e.g., within 25km). You can change this later in settings.',
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(color: Colors.brown.shade500),
                  ),
                  const SizedBox(height: Tokens.spaceSm),
                  if (!_permissionRequested)
                    OutlinedButton.icon(
                      onPressed: _requestLocationPermission,
                      icon: const Icon(Icons.my_location_outlined, size: 18),
                      label: const Text('Allow location access'),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: Tokens.pink,
                        side: BorderSide(color: Tokens.pink.withValues(alpha: 0.5)),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Tokens.radiusSm)),
                      ),
                    )
                  else if (!_permissionGranted)
                    TextButton.icon(
                      onPressed: () => openAppSettings(),
                      icon: const Icon(Icons.settings_outlined, size: 18),
                      label: const Text('Open settings to enable'),
                      style: TextButton.styleFrom(foregroundColor: Tokens.pink),
                    )
                  else
                    TextButton.icon(
                      onPressed: () => openAppSettings(),
                      icon: const Icon(Icons.settings_outlined, size: 18),
                      label: const Text('Change in settings'),
                      style: TextButton.styleFrom(foregroundColor: Tokens.pink),
                    ),
                ],
              ),
            ),
            const SizedBox(height: Tokens.spaceSm),
            Align(
              alignment: Alignment.centerRight,
              child: Text('Required', style: Theme.of(context).textTheme.bodySmall?.copyWith(color: Colors.brown.shade400)),
            ),
          ],
        ),
      );

  Future<void> openAppSettings() async {
    await Geolocator.openAppSettings();
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
}