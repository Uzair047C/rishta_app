/// Shared JSON coercion. One place that knows how to read a field defensively,
/// so no model repeats null-handling and a backend type change surfaces here
/// rather than in twelve `fromJson` bodies.
abstract final class Json {
  static String str(Map<String, dynamic> j, String k, [String fallback = '']) =>
      j[k] as String? ?? fallback;

  static String? optStr(Map<String, dynamic> j, String k) => j[k] as String?;

  static int intg(Map<String, dynamic> j, String k, [int fallback = 0]) {
    final v = j[k];
    if (v is int) return v;
    if (v is num) return v.toInt();
    return int.tryParse('$v') ?? fallback;
  }

  static double? optDouble(Map<String, dynamic> j, String k) {
    final v = j[k];
    if (v is num) return v.toDouble();
    return double.tryParse('$v');
  }

  static bool flag(Map<String, dynamic> j, String k, [bool fallback = false]) =>
      j[k] as bool? ?? fallback;

  static List<String> strings(Map<String, dynamic> j, String k) =>
      (j[k] as List<dynamic>? ?? const []).map((e) => '$e').toList(growable: false);

  static DateTime? date(Map<String, dynamic> j, String k) =>
      DateTime.tryParse('${j[k]}')?.toLocal();

  static T child<T>(Map<String, dynamic> j, String k, T Function(Map<String, dynamic>) fromJson) =>
      fromJson(j[k] as Map<String, dynamic>? ?? const {});

  static List<T> children<T>(
    Map<String, dynamic> j,
    String k,
    T Function(Map<String, dynamic>) fromJson,
  ) =>
      (j[k] as List<dynamic>? ?? const [])
          .map((e) => fromJson(e as Map<String, dynamic>))
          .toList(growable: false);
}

enum VerificationStatus {
  pending,
  verified,
  failed;

  static VerificationStatus parse(String? v) => switch (v) {
        'verified' => VerificationStatus.verified,
        'failed' => VerificationStatus.failed,
        _ => VerificationStatus.pending,
      };

  bool get isVerified => this == VerificationStatus.verified;
}

class Tag {
  const Tag({required this.id, required this.label});

  final int id;
  final String label;

  factory Tag.fromJson(Map<String, dynamic> j) =>
      Tag(id: Json.intg(j, 'id'), label: Json.str(j, 'label'));
}

/// What a feed card and a match row both need to render. The is-a relationship
/// is real — a feed card genuinely is a profile summary plus ranking metadata —
/// so the shared fields are declared once.
class ProfileSummary {
  const ProfileSummary({
    required this.userId,
    required this.photos,
    this.name,
    this.age,
    this.gender,
    this.location,
    this.bio = '',
    this.education,
    this.profession,
    this.maritalStatus,
    this.verification = VerificationStatus.pending,
  });

  final String userId;
  final List<String> photos;
  final String? name;
  final int? age;
  final String? gender;
  final String? location;
  final String bio;
  final String? education;
  final String? profession;
  final String? maritalStatus;
  final VerificationStatus verification;

  String? get primaryPhoto => photos.isEmpty ? null : photos.first;

  String get displayName => name ?? location ?? 'Rishta member';

  factory ProfileSummary.fromJson(Map<String, dynamic> j) => ProfileSummary(
        userId: Json.str(j, 'user_id'),
        photos: Json.strings(j, 'photos'),
        name: Json.optStr(j, 'name'),
        age: j['age'] == null ? null : Json.intg(j, 'age'),
        gender: Json.optStr(j, 'gender'),
        location: Json.optStr(j, 'location'),
        bio: Json.str(j, 'bio'),
        education: Json.optStr(j, 'education'),
        profession: Json.optStr(j, 'profession'),
        maritalStatus: Json.optStr(j, 'marital_status'),
        verification: VerificationStatus.parse(Json.optStr(j, 'verification_status')),
      );
}

/// Feed card = profile summary + why it was ranked here.
class FeedCard extends ProfileSummary {
  const FeedCard({
    required super.userId,
    required super.photos,
    required this.sharedInterests,
    super.name,
    super.age,
    super.gender,
    super.location,
    super.bio,
    super.education,
    super.profession,
    super.maritalStatus,
    super.verification,
    this.distanceKm,
  });

  final int sharedInterests;
  final double? distanceKm;

  factory FeedCard.fromJson(Map<String, dynamic> j) {
    final base = ProfileSummary.fromJson(j);
    return FeedCard(
      userId: base.userId,
      photos: base.photos,
      name: base.name,
      sharedInterests: Json.intg(j, 'shared_interests'),
      distanceKm: Json.optDouble(j, 'distance_km'),
      age: base.age,
      gender: base.gender,
      location: base.location,
      bio: base.bio,
      education: base.education,
      profession: base.profession,
      maritalStatus: base.maritalStatus,
      verification: base.verification,
    );
  }
}

class MatchSummary {
  const MatchSummary({required this.matchId, required this.other, required this.matchedAt});

  final String matchId;
  final ProfileSummary other;
  final DateTime? matchedAt;

  factory MatchSummary.fromJson(Map<String, dynamic> j) => MatchSummary(
        matchId: Json.str(j, 'match_id'),
        other: ProfileSummary.fromJson(j),
        matchedAt: Json.date(j, 'matched_at'),
      );
}

class Subscription {
  const Subscription({
    required this.status,
    required this.plan,
    required this.likesRemainingToday,
    required this.dailyAllowance,
    required this.canSendLikes,
    this.renewsAt,
    this.quotaResetAt,
  });

  final String status;
  final String plan;
  final int likesRemainingToday;
  final int dailyAllowance;
  final bool canSendLikes;
  final DateTime? renewsAt;
  final DateTime? quotaResetAt;

  bool get isActive => status == 'active';

  factory Subscription.fromJson(Map<String, dynamic> j) => Subscription(
        status: Json.str(j, 'status', 'inactive'),
        plan: Json.str(j, 'plan', 'free'),
        likesRemainingToday: Json.intg(j, 'likesRemainingToday'),
        dailyAllowance: Json.intg(j, 'dailyAllowance'),
        canSendLikes: Json.flag(j, 'canSendLikes'),
        renewsAt: Json.date(j, 'renewsAt'),
        quotaResetAt: Json.date(j, 'quotaResetAt'),
      );
}

class MyProfile {
  const MyProfile({
    required this.userId,
    required this.interests,
    required this.languages,
    required this.photos,
    required this.verification,
    this.name,
    this.gender,
    this.bio = '',
    this.education,
    this.profession,
    this.maritalStatus,
    this.location,
  });

  final String userId;
  final List<Tag> interests;
  final List<Tag> languages;
  final List<String> photos;
  final VerificationStatus verification;
  final String? name;
  final String? gender;
  final String bio;
  final String? education;
  final String? profession;
  final String? maritalStatus;
  final String? location;

  String? get primaryPhoto => photos.isEmpty ? null : photos.first;

  bool get isComplete =>
      name != null && gender != null && photos.isNotEmpty && interests.isNotEmpty;

  factory MyProfile.fromJson(Map<String, dynamic> j) {
    final user = j['user'] as Map<String, dynamic>? ?? const {};
    final profile = j['profile'] as Map<String, dynamic>? ?? const {};
    return MyProfile(
      userId: Json.str(user, 'id'),
      name: Json.optStr(profile, 'name'),
      gender: Json.optStr(user, 'gender'),
      location: Json.optStr(user, 'location'),
      bio: Json.str(profile, 'bio'),
      education: Json.optStr(profile, 'education'),
      profession: Json.optStr(profile, 'profession'),
      maritalStatus: Json.optStr(profile, 'marital_status'),
      photos: Json.strings(profile, 'photos'),
      verification: VerificationStatus.parse(Json.optStr(profile, 'verification_status')),
      interests: Json.children(j, 'interests', Tag.fromJson),
      languages: Json.children(j, 'languages', Tag.fromJson),
    );
  }
}

class NotificationPrefs {
  const NotificationPrefs({
    required this.newLike,
    required this.newMatch,
    required this.newMessage,
    required this.marketing,
  });

  final bool newLike;
  final bool newMatch;
  final bool newMessage;
  final bool marketing;

  NotificationPrefs copyWith({bool? newLike, bool? newMatch, bool? newMessage, bool? marketing}) =>
      NotificationPrefs(
        newLike: newLike ?? this.newLike,
        newMatch: newMatch ?? this.newMatch,
        newMessage: newMessage ?? this.newMessage,
        marketing: marketing ?? this.marketing,
      );

  factory NotificationPrefs.fromJson(Map<String, dynamic> j) => NotificationPrefs(
        newLike: Json.flag(j, 'newLike', true),
        newMatch: Json.flag(j, 'newMatch', true),
        newMessage: Json.flag(j, 'newMessage', true),
        marketing: Json.flag(j, 'marketing'),
      );
}

class LikeResult {
  const LikeResult({required this.matched, this.matchId, required this.likesRemainingToday});

  final bool matched;
  final String? matchId;
  final int likesRemainingToday;

  factory LikeResult.fromJson(Map<String, dynamic> j) => LikeResult(
        matched: Json.flag(j, 'matched'),
        matchId: Json.optStr(j, 'matchId'),
        likesRemainingToday: Json.intg(j, 'likesRemainingToday'),
      );
}
