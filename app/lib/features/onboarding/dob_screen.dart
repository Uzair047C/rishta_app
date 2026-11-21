import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/theme.dart';
import 'onboarding_scaffold.dart';

/// Date of birth screen with 18+ age gate.
class DobScreen extends ConsumerStatefulWidget {
  const DobScreen({
    super.key,
    required this.onConfirm,
    this.initialDob,
    this.currentStep = 0,
    this.totalSteps = 14,
    this.helpText,
  });

  final void Function(DateTime dob) onConfirm;
  final DateTime? initialDob;
  final int currentStep;
  final int totalSteps;
  final String? helpText;

  @override
  ConsumerState<DobScreen> createState() => _DobScreenState();
}

class _DobScreenState extends ConsumerState<DobScreen> {
  DateTime? _selectedDate;
  bool _busy = false;
  String? _error;
  static const _minAge = 18;

  @override
  void initState() {
    super.initState();
    _selectedDate = widget.initialDob;
  }

  int _calculateAge(DateTime dob) {
    final now = DateTime.now();
    int age = now.year - dob.year;
    if (now.month < dob.month || (now.month == dob.month && now.day < dob.day)) {
      age--;
    }
    return age;
  }

  void _submit() {
    if (_selectedDate == null) {
      setState(() => _error = 'Please select your date of birth');
      return;
    }
    final age = _calculateAge(_selectedDate!);
    if (age < _minAge) {
      setState(() => _error = 'You must be at least $_minAge years old to use this app');
      return;
    }
    if (age > 100) {
      setState(() => _error = 'Please enter a valid date of birth');
      return;
    }
    setState(() => _error = null);
    setState(() => _busy = true);
    widget.onConfirm(_selectedDate!);
  }

  Future<void> _pickDate() async {
    final now = DateTime.now();
    final firstDate = DateTime(now.year - 100);
    final lastDate = DateTime(now.year - _minAge, now.month, now.day);
    final picked = await showDatePicker(
      context: context,
      initialDate: _selectedDate ?? lastDate,
      firstDate: firstDate,
      lastDate: lastDate,
      builder: (context, child) => Theme(
        data: Theme.of(context).copyWith(
          colorScheme: Theme.of(context).colorScheme.copyWith(
            primary: Tokens.pink,
            onPrimary: Colors.white,
            surface: Tokens.tanCard,
            onSurface: Tokens.pinkDeep,
          ),
        ),
        child: child!,
      ),
    );
    if (picked != null && mounted) {
      setState(() {
        _selectedDate = picked;
        _error = null;
      });
    }
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
            Text('When were you born?', style: Theme.of(context).textTheme.headlineSmall?.copyWith(color: Tokens.pinkDeep, fontWeight: FontWeight.w800)),
            const SizedBox(height: Tokens.spaceSm),
            Text('Your age will be shown on your profile. You must be $_minAge+.', style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: Colors.brown.shade500)),
            const SizedBox(height: Tokens.spaceLg),
            InkWell(
              onTap: _pickDate,
              borderRadius: BorderRadius.circular(Tokens.radiusMd),
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 16),
                decoration: BoxDecoration(
                  color: Tokens.tanCard,
                  borderRadius: BorderRadius.circular(Tokens.radiusMd),
                  border: Border.all(
                    color: _error != null ? Colors.red : Tokens.pink.withValues(alpha: 0.25),
                    width: 1.5,
                  ),
                ),
                child: Row(
                  children: [
                    Icon(Icons.calendar_today_outlined, color: Tokens.pink, size: 22),
                    const SizedBox(width: Tokens.spaceMd),
                    Expanded(
                      child: Text(
                        _selectedDate != null
                            ? DateFormat('MMMM d, yyyy').format(_selectedDate!)
                            : 'Select your date of birth',
                        style: TextStyle(
                          fontSize: 16,
                          color: _selectedDate != null ? Tokens.pinkDeep : Colors.brown.shade300,
                          fontWeight: _selectedDate != null ? FontWeight.w500 : FontWeight.w400,
                        ),
                      ),
                    ),
                    if (_selectedDate != null)
                      Text(
                        '(${_calculateAge(_selectedDate!)} years old)',
                        style: TextStyle(fontSize: 14, color: Colors.brown.shade500),
                      ),
                  ],
                ),
              ),
            ),
            if (_error != null) ...[
              const SizedBox(height: Tokens.spaceSm),
              Text(_error!, style: TextStyle(color: Colors.red.shade700, fontSize: 13)),
            ],
            const SizedBox(height: Tokens.spaceSm),
            Align(
              alignment: Alignment.centerRight,
              child: Text('Required', style: Theme.of(context).textTheme.bodySmall?.copyWith(color: Colors.brown.shade400)),
            ),
          ],
        ),
      );

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