import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:stream_chat_flutter/stream_chat_flutter.dart';

import '../../core/api.dart';
import '../../core/models.dart';
import '../../core/providers.dart';
import '../../core/widgets.dart';

/// Stream manages its own connection lifetime, so the client is a provider
/// rather than something a widget owns and disposes on every navigation.
final streamClientProvider = FutureProvider<StreamChatClient>((ref) async {
  final api = ref.watch(apiProvider);

  const apiKey = String.fromEnvironment('STREAM_API_KEY');
  if (apiKey.isEmpty) throw StateError('STREAM_API_KEY is not configured');

  // The token is issued by our backend only after Firebase auth succeeds
  // (spec 2.1); Stream never sees an unauthenticated user.
  final token = await api.get<String>('/auth/stream-token', (j) => '${(j as Map)['token']}');
  final me = await api.get<MyProfile>('/profile', (j) => MyProfile.fromJson(j as Map<String, dynamic>));

  final client = StreamChatClient(apiKey, logLevel: Level.OFF);
  await client.connectUser(User(id: me.userId), token);
  ref.onDispose(() => client.disconnectUser());
  return client;
});

/// One-to-one chat for a match, rendered with Stream's prebuilt channel UI —
/// which is also what provides attachments and voice notes for free.
class ChatScreen extends ConsumerWidget {
  const ChatScreen({super.key, required this.match});

  final MatchSummary match;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final client = ref.watch(streamClientProvider);

    return AsyncView(
      value: client,
      onRetry: () => ref.invalidate(streamClientProvider),
      builder: (stream) {
        // Channel id is derived from the match id, so both participants land in
        // the same channel without a separate lookup.
        final channel = stream.channel('messaging', id: 'match-${match.matchId}');
        return StreamChat(
          client: stream,
          child: ChannelPage(channel: channel, match: match),
        );
      },
    );
  }
}

class ChannelPage extends ConsumerWidget {
  const ChannelPage({super.key, required this.channel, required this.match});

  final Channel channel;
  final MatchSummary match;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Spec 1.2 — report and unmatch are reachable from the chat thread, not
    // just the matches list. Block uses the feed endpoint, which also ends the
    // match server-side.
    return StreamChannel(
      channel: channel,
      child: Scaffold(
        appBar: StreamChannelHeader(
          actions: [
            IconButton(
              icon: const Icon(Icons.more_vert),
              tooltip: 'Safety menu',
              onPressed: () => _safetyMenu(context, ref),
            ),
          ],
        ),
        body: const Column(
          children: [
            Expanded(child: StreamMessageListView()),
            StreamMessageInput(),
          ],
        ),
      ),
    );
  }

  Future<void> _safetyMenu(BuildContext context, WidgetRef ref) async {
    final choice = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (sheetContext) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SectionHeader('Safety'),
            for (final r in kReportReasons)
              ListTile(
                title: Text('Report: $r'),
                onTap: () => Navigator.of(sheetContext).pop('report:$r'),
              ),
            const Divider(),
            ListTile(
              leading: const Icon(Icons.person_remove),
              title: const Text('Unmatch'),
              subtitle: const Text('Ends the match and this chat'),
              onTap: () => Navigator.of(sheetContext).pop('unmatch'),
            ),
            ListTile(
              leading: const Icon(Icons.block),
              title: const Text('Block'),
              subtitle: const Text('Ends the match and hides them everywhere'),
              onTap: () => Navigator.of(sheetContext).pop('block'),
            ),
          ],
        ),
      ),
    );
    if (choice == null || !context.mounted) return;

    final messenger = ScaffoldMessenger.of(context);
    try {
      if (choice == 'unmatch') {
        await ref.read(matchesProvider.notifier).unmatch(match.matchId);
        messenger.showSnackBar(const SnackBar(content: Text('Unmatched.')));
        if (context.mounted) Navigator.of(context).pop();
      } else if (choice == 'block') {
        await ref.read(apiProvider).post('/feed/block', body: {
          'userId': match.other.userId,
          'reason': 'Blocked',
        });
        ref.invalidate(matchesProvider);
        messenger.showSnackBar(const SnackBar(content: Text('Blocked.')));
        if (context.mounted) Navigator.of(context).pop();
      } else if (choice.startsWith('report:')) {
        await ref.read(apiProvider).post('/reports', body: {
          'reportedId': match.other.userId,
          'matchId': match.matchId,
          'reason': choice.substring(7),
        });
        messenger.showSnackBar(const SnackBar(content: Text('Thanks — we will review this.')));
      }
    } catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(messageFor(e))));
    }
  }
}

