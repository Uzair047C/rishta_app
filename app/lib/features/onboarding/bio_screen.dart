import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme.dart';
import 'onboarding_scaffold.dart';

/// Free-text bio screen with "Add bio" button.
class BioScreen extends ConsumerStatefulWidget {
  const BioScreen({
    super.key,
    required this.onSubmit,
    this.initialBio,
    this.currentStep = 0,
    this.totalSteps = 14,
    this.helpText,
  });

  final void Function(String bio) onSubmit;
  final String? initialBio;
  final int currentStep;
  final int totalSteps;
  final String? helpText;

  @override
  ConsumerState<BioScreen> createState() => _BioScreenState();
}

class _BioScreenState extends ConsumerState<BioScreen> {
  final _ctrl = TextEditingController();
  final _focusNode = FocusNode();
  bool _busy = false; // ignore: prefer_final_fields

  @override
  void initState() {
    super.initState();
    if (widget.initialBio != null) _ctrl.text = widget.initialBio!;
    _focusNode.requestFocus();
  }

  @override
  void dispose() {
    _ctrl.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  void _submit() {
    final bio = _ctrl.text.trim();
    widget.onSubmit(bio);
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
          child: Text(_busy ? 'Saving…' : 'Add bio', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Tell us about yourself', style: Theme.of(context).textTheme.headlineSmall?.copyWith(color: Tokens.pinkDeep, fontWeight: FontWeight.w800)),
            const SizedBox(height: Tokens.spaceSm),
            Text('Your hobbies, future plans, what you\'re looking for…', style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: Colors.brown.shade500)),
            const SizedBox(height: Tokens.spaceLg),
            TextField(
              controller: _ctrl,
              focusNode: _focusNode,
              maxLines: 8,
              maxLength: 1000,
              minLines: 5,
              textCapitalization: TextCapitalization.sentences,
              decoration: InputDecoration(
                hintText: 'Tell us about yourself, your hobbies & future plans',
                hintStyle: TextStyle(color: Colors.brown.shade300),
                filled: true,
                fillColor: Tokens.tanCard,
                contentPadding: const EdgeInsets.all(Tokens.spaceMd),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(Tokens.radiusMd), borderSide: BorderSide.none),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(Tokens.radiusMd),
                  borderSide: BorderSide(color: Tokens.pink.withValues(alpha: 0.25)),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(Tokens.radiusMd),
                  borderSide: const BorderSide(color: Tokens.pink, width: 2),
                ),
              ),
            ),
            const SizedBox(height: Tokens.spaceSm),
            Align(
              alignment: Alignment.centerRight,
              child: Text('Optional — you can add this later', style: Theme.of(context).textTheme.bodySmall?.copyWith(color: Colors.brown.shade400)),
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