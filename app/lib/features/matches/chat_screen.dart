import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:stream_chat_flutter/stream_chat_flutter.dart';

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
          child: ChannelPage(channel: channel),
        );
      },
    );
  }
}

class ChannelPage extends StatelessWidget {
  const ChannelPage({super.key, required this.channel});

  final Channel channel;

  @override
  Widget build(BuildContext context) {
    return StreamChannel(
      channel: channel,
      child: const Scaffold(
        appBar: StreamChannelHeader(),
        body: Column(
          children: [
            Expanded(child: StreamMessageListView()),
            StreamMessageInput(),
          ],
        ),
      ),
    );
  }
}

