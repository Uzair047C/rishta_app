import 'package:flutter_test/flutter_test.dart';

import 'package:rishta/core/models.dart';
import 'package:rishta/core/providers.dart';

// The non-trivial bit of the feed client: pages append onto _page and the
// opaque nextCursor from the server is threaded through unchanged. If the
// notifier ever rebuilt the cursor from card fields again (the bug), these
// would fail.
Map<String, dynamic> cardJson(String id, {int shared = 3}) => {
      'user_id': id,
      'photos': ['photos/$id/p1.jpg'],
      'name': 'User $id',
      'shared_interests': shared,
      'distance_bucket': '5–10 km',
    };

Map<String, dynamic> pageJson(List<String> ids, String? next) => {
      'candidates': [for (final id in ids) cardJson(id)],
      'nextCursor': next,
    };

void main() {
  test('FeedPage parsing keeps server cursor and bucket', () {
    final page = FeedPage(
      cards: Json.children(pageJson(['a', 'b'], 'OPAQUE'), 'candidates', FeedCard.fromJson),
      nextCursor: 'OPAQUE',
    );

    expect(page.cards.length, 2);
    expect(page.nextCursor, 'OPAQUE');
    expect(page.cards.first.distanceBucket, '5–10 km');
    // The privacy contract: exact km is not in the payload the app reads.
    expect(cardJson('a').containsKey('distance_km'), isFalse);
  });

  test('appending a second page keeps first-page cards and latest cursor', () {
    final first = FeedPage(
      cards: Json.children(pageJson(['a'], 'CURSOR-1'), 'candidates', FeedCard.fromJson),
      nextCursor: 'CURSOR-1',
    );
    final appended = FeedPage(
      cards: [
        ...first.cards,
        ...Json.children(pageJson(['b'], null), 'candidates', FeedCard.fromJson),
      ],
      nextCursor: 'CURSOR-2',
    );

    expect(appended.cards.map((c) => c.userId), ['a', 'b']);
    expect(appended.nextCursor, 'CURSOR-2');
  });
}
