import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme.dart';
import 'onboarding_scaffold.dart';

/// Name input screen.
class NameScreen extends ConsumerStatefulWidget {
  const NameScreen({
    super.key,
    required this.onConfirm,
    this.initialName,
    this.currentStep = 0,
    this.totalSteps = 14,
    this.helpText,
  });

  final void Function(String name) onConfirm;
  final String? initialName;
  final int currentStep;
  final int totalSteps;
  final String? helpText;

  @override
  ConsumerState<NameScreen> createState() => _NameScreenState();
}

class _NameScreenState extends ConsumerState<NameScreen> {
  final _ctrl = TextEditingController();
  final _focusNode = FocusNode();
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    if (widget.initialName != null) _ctrl.text = widget.initialName!;
    _focusNode.requestFocus();
  }

  @override
  void dispose() {
    _ctrl.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  void _submit() {
    final name = _ctrl.text.trim();
    if (name.isEmpty) {
      setState(() => _error = 'Please enter your name');
      return;
    }
    if (name.length < 2) {
      setState(() => _error = 'Name is too short');
      return;
    }
    if (name.length > 50) {
      setState(() => _error = 'Name is too long');
      return;
    }
    setState(() => _error = null);
    setState(() => _busy = true);
    widget.onConfirm(name);
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
            Text('What\'s your name?', style: Theme.of(context).textTheme.headlineSmall?.copyWith(color: Tokens.pinkDeep, fontWeight: FontWeight.w800)),
            const SizedBox(height: Tokens.spaceSm),
            Text('This will be shown on your profile.', style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: Colors.brown.shade500)),
            const SizedBox(height: Tokens.spaceLg),
            TextField(
              controller: _ctrl,
              focusNode: _focusNode,
              textCapitalization: TextCapitalization.words,
              maxLength: 50,
              decoration: InputDecoration(
                hintText: 'Enter your name',
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