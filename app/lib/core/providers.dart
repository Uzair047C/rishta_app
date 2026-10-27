import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'api.dart';
import 'auth_providers.dart';
import 'models.dart';

/// ------------------------------------------------------------------ api

/// API provider with auth storage for token management
final apiProvider = Provider<Api>((ref) {
  final authStorage = ref.watch(authStorageProvider);
  return Api(authStorage: authStorage);
});

/// --------------------------------------------------------- repositories

/// Generic read-only remote collection. Every list endpoint is one of these,
/// so the fetch-and-parse code exists once rather than per resource.
class RemoteRepo<T> {
  const RemoteRepo(this._api, this._path, this._fromJson, {this.key = 'items'});

  final Api _api;
  final String _path;
  final T Function(Map<String, dynamic>) _fromJson;
  final String key;

  Future<List<T>> list({Map<String, Object?>? query}) =>
      _api.listOf(_path, _fromJson, query: query, key: key);
}

final matchesRepoProvider = Provider<RemoteRepo<MatchSummary>>(
  (ref) => RemoteRepo(ref.watch(apiProvider), '/matches', MatchSummary.fromJson, key: 'matches'),
);

/// ------------------------------------------------------- async notifier

/// Shared lifecycle for every remotely-backed notifier: subclasses supply
/// [fetch] and inherit build, refresh and error mapping.
abstract class RemoteAsync<T> extends AsyncNotifier<T> {
  Api get api => ref.read(apiProvider);

  Future<T> fetch(Api api);

  @override
  Future<T> build() => fetch(api);

  /// Re-fetches, keeping previous data visible while refetching.
  /// Uses AsyncValue.guard so the UI doesn't flicker.
  Future<void> reload() async {
    state = await AsyncValue.guard(() => fetch(api));
  }
}


/// ------------------------------------------------------------ profile

final myProfileProvider = AsyncNotifierProvider<MyProfileNotifier, MyProfile>(
  MyProfileNotifier.new,
);

class MyProfileNotifier extends RemoteAsync<MyProfile> {
  @override
  Future<MyProfile> fetch(Api api) =>
      api.get('/profile', (j) => MyProfile.fromJson(j as Map<String, dynamic>));

  Future<void> save(Map<String, Object?> body) async {
    await api.post('/profile', body: body);
    await reload();
  }

  Future<void> addPhoto(String url, {bool makePrimary = false}) async {
    await api.post('/profile/photo', body: {'url': url, 'makePrimary': makePrimary});
    await reload();
  }
}

/// Tag catalogue for the interest/language pickers.
final tagsProvider = FutureProvider<({List<Tag> interests, List<Tag> languages})>((ref) async {
  final api = ref.watch(apiProvider);
  return api.get('/profile/interests', (j) {
    final map = j as Map<String, dynamic>;
    return (
      interests: Json.children(map, 'interests', Tag.fromJson),
      languages: Json.children(map, 'languages', Tag.fromJson),
    );
  });
});

/// Interest categories for the onboarding flow.
final interestCategoriesProvider = FutureProvider<List<TagCategory>>((ref) async {
  final api = ref.watch(apiProvider);
  return api.get('/profile/interest-categories', (j) {
    final map = j as Map<String, dynamic>;
    final categoriesJson = Json.children(map, 'categories', (j) => j);
    return categoriesJson.map((categoryJson) {
      final name = Json.str(categoryJson, 'name');
      final tagsJson = Json.children(categoryJson, 'tags', Tag.fromJson);
      final tags = tagsJson.map<TagItem>((tag) => TagItem(
            id: tag.id,
            label: tag.label,
            iconCode: null,
          )).toList();
      return TagCategory(name: name, tags: tags);
    }).toList();
  });
});

/// Personality categories for the onboarding flow.
final personalityCategoriesProvider = FutureProvider<List<TagCategory>>((ref) async {
  final api = ref.watch(apiProvider);
  return api.get('/profile/personality-categories', (j) {
    final map = j as Map<String, dynamic>;
    final categoriesJson = Json.children(map, 'categories', (j) => j);
    return categoriesJson.map((categoryJson) {
      final name = Json.str(categoryJson, 'name');
      final tagsJson = Json.children(categoryJson, 'tags', Tag.fromJson);
      final tags = tagsJson.map<TagItem>((tag) => TagItem(
            id: tag.id,
            label: tag.label,
            iconCode: null,
          )).toList();
      return TagCategory(name: name, tags: tags);
    }).toList();
  });
});


/// ----------------------------------------------------------- filters

class FeedFilters {
  const FeedFilters({this.minAge = 18, this.maxAge = 60, this.radiusKm});

  final int minAge;
  final int maxAge;
  final int? radiusKm;

  FeedFilters copyWith({int? minAge, int? maxAge, int? radiusKm, bool clearRadius = false}) =>
      FeedFilters(
        minAge: minAge ?? this.minAge,
        maxAge: maxAge ?? this.maxAge,
        radiusKm: clearRadius ? null : (radiusKm ?? this.radiusKm),
      );

  Map<String, Object?> toQuery() => {
        'minAge': minAge,
        'maxAge': maxAge,
        if (radiusKm != null) 'radiusKm': radiusKm,
      };
}

final feedFiltersProvider = StateProvider<FeedFilters>((_) => const FeedFilters());

/// -------------------------------------------------------------- feed

/// Feed cursor for keyset pagination.
class FeedCursor {
  const FeedCursor({
    required this.sharedInterests,
    this.distanceKm,
    required this.userId,
  });

  final int sharedInterests;
  final double? distanceKm;
  final String userId;

  Map<String, Object?> toQuery() => {
        'cursor': {
          'shared_interests': sharedInterests,
          'distance_km': distanceKm,
          'user_id': userId,
        },
      };
}

final feedProvider = AsyncNotifierProvider<FeedNotifier, List<FeedCard>>(FeedNotifier.new);

class FeedNotifier extends RemoteAsync<List<FeedCard>> {
  /// Current cursor for pagination.
  FeedCursor? _cursor;

  @override
  Future<List<FeedCard>> fetch(Api api) {
    final baseQuery = ref.read(feedFiltersProvider).toQuery();
    final cursorQuery = _cursor?.toQuery()['cursor'] as Map<String, Object?>?;
    final query = {
      ...baseQuery,
      if (cursorQuery != null) ...cursorQuery,
    };
    return api.listOf(
      '/feed',
      FeedCard.fromJson,
      query: query,
      key: 'candidates',
    );
  }

  /// Load next page of feed.
  Future<void> loadMore() async {
    final current = state.valueOrNull;
    if (current == null || current.length < 5) return; // Only load more when 5 cards remain

    final last = current.last;
    _cursor = FeedCursor(
      sharedInterests: last.sharedInterests,
      distanceKm: last.distanceKm,
      userId: last.userId,
    );
    await reload();
  }

  /// Reset to first page.
  Future<void> reset() async {
    _cursor = null;
    await reload();
  }

  /// Optimistically drops the swiped card, then reconciles the quota from the
  /// server response — the server's count is authoritative, never an estimate.
  Future<LikeResult?> like(FeedCard card) async {
    final previous = state.valueOrNull ?? const <FeedCard>[];
    _drop(card.userId);
    ref.invalidate(subscriptionProvider);
    try {
      return await api.post('/feed/like', body: {'userId': card.userId}, parse: (j) {
        return LikeResult.fromJson(j as Map<String, dynamic>);
      });
    } on ApiException {
      state = AsyncValue.data(previous); // put the card back; the like did not land
      rethrow;
    }
  }

  Future<void> pass(FeedCard card) async {
    final previous = state.valueOrNull ?? const <FeedCard>[];
    try {
      await api.post('/feed/pass', body: {'userId': card.userId});
      _drop(card.userId);
    } on ApiException {
      state = AsyncValue.data(previous);
      rethrow;
    }
  }

  Future<void> block(FeedCard card, {String? reason}) async {
    final previous = state.valueOrNull ?? const <FeedCard>[];
    try {
      await api.post('/feed/block', body: {
        'userId': card.userId,
        if (reason != null) 'reason': reason,
      });
      _drop(card.userId);
      ref.invalidate(matchesProvider);
    } on ApiException {
      state = AsyncValue.data(previous);
      rethrow;
    }
  }

  void _drop(String userId) {
    final current = state.valueOrNull;
    if (current == null) return;
    state = AsyncValue.data(
      current.where((c) => c.userId != userId).toList(growable: false),
    );
  }
}

/// ----------------------------------------------------------- matches

final matchesProvider =
    AsyncNotifierProvider<MatchesNotifier, List<MatchSummary>>(MatchesNotifier.new);

class MatchesNotifier extends RemoteAsync<List<MatchSummary>> {
  @override
  Future<List<MatchSummary>> fetch(Api api) => ref.read(matchesRepoProvider).list();

  /// Spec 1.2 — unmatch is separate from block/report.
  Future<void> unmatch(String matchId) async {
    await api.delete('/matches/$matchId');
    final current = state.valueOrNull;
    if (current == null) return;
    state = AsyncValue.data(
      current.where((m) => m.matchId != matchId).toList(growable: false),
    );
  }
}

/// ----------------------------------------------------- notification

final notificationPrefsProvider =
    AsyncNotifierProvider<NotificationPrefsNotifier, NotificationPrefs>(
  NotificationPrefsNotifier.new,
);

class NotificationPrefsNotifier extends RemoteAsync<NotificationPrefs> {
  @override
  Future<NotificationPrefs> fetch(Api api) =>
      api.get('/notifications/preferences', (j) => NotificationPrefs.fromJson(j as Map<String, dynamic>));

  Future<void> set(NotificationPrefs prefs) async {
    state = AsyncValue.data(prefs); // toggles feel instant; server confirms next read
    final confirmed = await api.put('/notifications/preferences', body: {
      'newLike': prefs.newLike,
      'newMatch': prefs.newMatch,
      'newMessage': prefs.newMessage,
      'marketing': prefs.marketing,
    }, parse: (j) => NotificationPrefs.fromJson(j as Map<String, dynamic>));
    state = AsyncValue.data(confirmed);
  }
}

/// ------------------------------------------------------ subscription

final subscriptionProvider = FutureProvider<Subscription>((ref) async {
  final api = ref.watch(apiProvider);
  return api.get('/subscription', (j) => Subscription.fromJson(j as Map<String, dynamic>));
});