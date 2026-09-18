import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api.dart';
import '../../core/theme.dart';
import 'onboarding_scaffold.dart';

/// Reusable searchable single-select screen for profession, nationality, ethnicity.
/// Fetches options from API endpoint with a "Suggested" section.
class SearchableSingleSelectScreen extends ConsumerStatefulWidget {
  const SearchableSingleSelectScreen({
    super.key,
    required this.title,
    required this.apiPath,
    required this.onConfirm,
    this.suggestedApiPath,
    this.initialValue,
    this.itemLabel,
    this.itemIcon,
    this.isSkippable = false,
    this.onSkip,
    this.currentStep = 0,
    this.totalSteps = 14,
    this.helpText,
  });

  final String title;
  final String apiPath; // e.g. '/professions'
  final String? suggestedApiPath; // e.g. '/professions/suggested'
  final void Function(dynamic selected) onConfirm;
  final dynamic initialValue;
  final String Function(dynamic item)? itemLabel;
  final Widget Function(dynamic item)? itemIcon;
  final bool isSkippable;
  final VoidCallback? onSkip;
  final int currentStep;
  final int totalSteps;
  final String? helpText;

  @override
  ConsumerState<SearchableSingleSelectScreen> createState() => _SearchableSingleSelectScreenState();
}

class _SearchableSingleSelectScreenState extends ConsumerState<SearchableSingleSelectScreen> {
  final _searchCtrl = TextEditingController();
  List<dynamic> _allItems = [];
  List<dynamic> _suggestedItems = [];
  List<dynamic> _filteredItems = [];
  dynamic _selected;
  bool _loading = true;
  String _query = '';

  @override
  void initState() {
    super.initState();
    _selected = widget.initialValue;
    _loadData();
    _searchCtrl.addListener(_onSearchChanged);
  }

  @override
  void dispose() {
    _searchCtrl.removeListener(_onSearchChanged);
    _searchCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadData() async {
    setState(() => _loading = true);
    try {
      final api = ref.read(apiProvider);
      final all = await api.get<List<dynamic>>(widget.apiPath, (j) => (j as List).cast<dynamic>());
      _allItems = all;
      _filteredItems = all;

      if (widget.suggestedApiPath != null) {
        final suggested = await api.get<List<dynamic>>(widget.suggestedApiPath!, (j) => (j as List).cast<dynamic>());
        _suggestedItems = suggested;
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to load options: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _onSearchChanged() {
    final q = _searchCtrl.text.toLowerCase().trim();
    setState(() {
      _query = q;
      if (q.isEmpty) {
        _filteredItems = _allItems;
      } else {
        _filteredItems = _allItems.where((item) {
          final label = widget.itemLabel?.call(item) ?? item.toString();
          return label.toLowerCase().contains(q);
        }).toList();
      }
    });
  }

  void _onItemTap(dynamic item) {
    setState(() => _selected = item);
  }

  @override
  Widget build(BuildContext context) {
    final label = widget.itemLabel ?? ((item) => item['label']?.toString() ?? item['name']?.toString() ?? item.toString());

    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }

    return OnboardingScaffold(
      currentStep: widget.currentStep,
      totalSteps: widget.totalSteps,
      onBack: () => Navigator.of(context).pop(),
      onHelp: widget.helpText != null ? () => _showHelp(context) : null,
      bottomAction: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          FilledButton(
            onPressed: _selected != null ? () => widget.onConfirm(_selected!) : null,
            style: FilledButton.styleFrom(
              minimumSize: const Size.fromHeight(52),
              backgroundColor: Tokens.pink,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Tokens.radiusMd)),
            ),
            child: Text('Confirm (${_selected != null ? 1 : 0})', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
          ),
          if (widget.isSkippable && widget.onSkip != null) ...[
            const SizedBox(height: Tokens.spaceSm),
            TextButton(onPressed: widget.onSkip, child: const Text('Skip', style: TextStyle(fontSize: 14, color: Tokens.pinkDeep))),
          ],
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(widget.title, style: Theme.of(context).textTheme.headlineSmall?.copyWith(color: Tokens.pinkDeep, fontWeight: FontWeight.w800)),
          const SizedBox(height: Tokens.spaceLg),
          // Search field
          TextField(
            controller: _searchCtrl,
            autofocus: true,
            decoration: InputDecoration(
              hintText: 'Search...',
              hintStyle: TextStyle(color: Colors.brown.shade300),
              prefixIcon: const Icon(Icons.search, color: Tokens.pink),
              filled: true,
              fillColor: Tokens.tanCard,
              contentPadding: const EdgeInsets.symmetric(vertical: 12, horizontal: 16),
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
          const SizedBox(height: Tokens.spaceMd),
          // List
          Expanded(
            child: _filteredItems.isEmpty && _query.isNotEmpty
                ? Center(child: Text('No results', style: TextStyle(color: Colors.brown.shade400)))
                : ListView(
                    children: [
                      if (_suggestedItems.isNotEmpty) ...[
                        _SectionHeader('Suggested'),
                        for (final item in _suggestedItems)
                          _buildItemTile(item, label, isSuggested: true),
                        const Divider(height: Tokens.spaceLg),
                      ],
                      _SectionHeader('All'),
                      for (final item in _filteredItems)
                        _buildItemTile(item, label),
                    ],
                  ),
          ),
        ],
      ),
    );
  }

  Widget _buildItemTile(dynamic item, String Function(dynamic) label, {bool isSuggested = false}) {
    final isSelected = _selected == item;
    final itemLabel = label(item);
    final icon = widget.itemIcon?.call(item);

    return RadioListTile<dynamic>(
      value: item,
      groupValue: _selected,
      onChanged: (v) => _onItemTap(v!),
      title: Row(
        children: [
          if (icon != null) ...[icon, const SizedBox(width: Tokens.spaceSm)],
          Expanded(child: Text(itemLabel, style: TextStyle(color: isSelected ? Tokens.pinkDeep : Colors.brown.shade700, fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500, fontSize: 15))),
        ],
      ),
      secondary: isSelected ? const Icon(Icons.check_circle, color: Tokens.pink, size: 22) : null,
      activeColor: Tokens.pink,
      contentPadding: const EdgeInsets.symmetric(horizontal: Tokens.spaceSm, vertical: 2),
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
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader(this.text);
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: Tokens.spaceSm, top: Tokens.spaceSm),
        child: Text(text, style: TextStyle(fontWeight: FontWeight.w700, color: Tokens.pinkDeep, fontSize: 13)),
      );
}