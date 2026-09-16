import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api.dart';
import '../../core/models.dart';
import '../../core/providers.dart';
import '../../core/widgets.dart';
import 'chat_screen.dart';

/// Matches list. Spec 1.2 — this stays reachable when a subscription lapses.
class MatchesScreen extends ConsumerWidget {
  const MatchesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final matches = ref.watch(matchesProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Matches')),
      body: AsyncView(
        value: matches,
        onRetry: () => ref.invalidate(matchesProvider),
        isEmpty: (list) => list.isEmpty,
        emptyLabel: 'No matches yet. Keep browsing — a mutual like starts a chat.',
        builder: (list) => RefreshIndicator(
          onRefresh: () => ref.read(matchesProvider.notifier).reload(),
          child: ListView.separated(
            itemCount: list.length,
            separatorBuilder: (_, __) => const Divider(height: 1),
            itemBuilder: (context, i) => _MatchTile(match: list[i]),
          ),
        ),
      ),
    );
  }
}

class _MatchTile extends ConsumerWidget {
  const _MatchTile({required this.match});

  final MatchSummary match;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final other = match.other;

    return ListTile(
      leading: SizedBox.square(
        dimension: 52,
        child: ClipOval(
          child: ProfilePhoto(url: other.primaryPhoto, label: '${other.displayName} profile photo'),
        ),
      ),
      title: ProfileNameBadge(name: other.displayName, age: other.age, verification: other.verification),
      subtitle: Text(
        other.bio.isEmpty ? (other.location ?? '') : other.bio,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
      ),
      trailing: PopupMenuButton<String>(
        // Unmatch lives here rather than behind a swipe: it is destructive and
        // should take a deliberate second tap.
        itemBuilder: (_) => const [
          PopupMenuItem(value: 'unmatch', child: Text('Unmatch')),
          PopupMenuItem(value: 'report', child: Text('Report')),
        ],
        onSelected: (value) async {
          final messenger = ScaffoldMessenger.of(context);
          if (value == 'unmatch') {
            await ref.read(matchesProvider.notifier).unmatch(match.matchId);
            messenger.showSnackBar(const SnackBar(content: Text('Unmatched.')));
          } else {
            await _report(context, ref);
          }
        },
      ),
      onTap: () => Navigator.of(context).push(
        MaterialPageRoute(builder: (_) => ChatScreen(match: match)),
      ),
    );
  }

  Future<void> _report(BuildContext context, WidgetRef ref) async {
    final reason = await showDialog<String>(
      context: context,
      builder: (dialogContext) => SimpleDialog(
        title: const Text('Report this profile'),
        children: [
          for (final r in kReportReasons)
            SimpleDialogOption(
              onPressed: () => Navigator.of(dialogContext).pop(r),
              child: Text(r),
            ),
        ],
      ),
    );
    if (reason == null) return;
    await ref.read(apiProvider).post('/reports', body: {
      'reportedId': match.other.userId,
      'matchId': match.matchId,
      'reason': reason,
    });
  }
}
