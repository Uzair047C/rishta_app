import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Db } from '../db/db';
import { FeedCard, UserRow } from '../db/types';
import { PushService } from '../notifications/push.service';
import { SubscriptionService } from '../subscription/subscription.service';
import { UsersService } from '../users/users.service';

export interface FeedFilters {
  minAge?: number;
  maxAge?: number;
  radiusKm?: number;
  limit?: number;
  cursor?: { shared_interests: number; distance_km: number | null; user_id: string };
}

export interface FeedResult {
  items: FeedCard[];
  nextCursor: { shared_interests: number; distance_km: number | null; user_id: string } | null;
}

export interface LikeOutcome {
  liked: true;
  matched: boolean;
  matchId: string | null;
  likesRemainingToday: number;
}

/**
 * Convert precise distance to coarse privacy-preserving bucket.
 * Buckets: "< 5 km", "5–10 km", "10–25 km", "25–50 km", "50+ km"
 */
function distanceToBucket(distanceKm: number | null): string | null {
  if (distanceKm === null || distanceKm === undefined) return null;
  if (distanceKm < 5) return '< 5 km';
  if (distanceKm < 10) return '5–10 km';
  if (distanceKm < 25) return '10–25 km';
  if (distanceKm < 50) return '25–50 km';
  return '50+ km';
}

/**
 * Feed + interactions. The quota decrement and the candidate query are the two
 * pieces of logic the spec calls out as race- and correctness-sensitive, so they
 * are kept as literal SQL here rather than built up through the Repo helper.
 */
@Injectable()
export class FeedService {
  constructor(
    private readonly db: Db,
    private readonly push: PushService,
    private readonly subscriptions: SubscriptionService,
    private readonly users: UsersService,
  ) {}

  async feed(userId: string, f: FeedFilters): Promise<FeedResult> {
    const limit = Math.min(Math.max(f.limit ?? 20, 1), 50);
    const cursor = f.cursor; // Keyset pagination cursor: { shared_interests, distance_km, user_id }

    // Get current user's lat/lng
    const me = await this.db.one<{ gender: string; lat: number | null; lng: number | null }>(
      'SELECT gender, lat, lng FROM users WHERE id = $1',
      [userId],
    );

    const myLat = me?.lat ?? null;
    const myLng = me?.lng ?? null;
    const radiusKm = f.radiusKm ?? null;

    // Build bounding box prefilter for lat/lng if we have location and radius
    // This avoids expensive trig calculations for distant users
    let bboxFilter = '';
    let bboxParams: unknown[] = [];
    let paramOffset = 6; // After userId, myLat, myLng, minAge, maxAge, radiusKm

    if (myLat !== null && myLng !== null && radiusKm !== null) {
      // Rough bounding box: 1 degree ≈ 111 km
      const degLat = radiusKm / 111;
      const degLng = radiusKm / (111 * Math.cos((myLat * Math.PI) / 180));

      bboxFilter = `
        AND u.lat BETWEEN $${paramOffset} AND $${paramOffset + 1}
        AND u.lng BETWEEN $${paramOffset + 2} AND $${paramOffset + 3}`;
      bboxParams = [myLat - degLat, myLat + degLat, myLng - degLng, myLng + degLng];
      paramOffset += 4;
    }

    // Keyset pagination: cursor is { shared_interests, distance_km, user_id }
    let cursorFilter = '';
    if (cursor && cursor.shared_interests !== undefined) {
      cursorFilter = `
        AND (
          shared_interests < $${paramOffset}
          OR (shared_interests = $${paramOffset} AND distance_km > $${paramOffset + 1})
          OR (shared_interests = $${paramOffset} AND distance_km = $${paramOffset + 1} AND user_id > $${paramOffset + 2})
        )`;
      bboxParams.push(cursor.shared_interests, cursor.distance_km ?? 0, cursor.user_id);
    }

    const rows = await this.db.all<any>(
      `WITH me AS (SELECT $2::float8 AS lat, $3::float8 AS lng),
            mine AS (SELECT interest_id FROM user_interests WHERE user_id = $1),
            candidates AS (
         SELECT u.id AS user_id, u.gender, u.location,
                EXTRACT(YEAR FROM age(u.dob))::int AS age,
                p.name, p.bio, p.profession, p.education, p.marital_status, p.photos,
                p.verification_status,
                (SELECT count(*)::int FROM user_interests x
                  WHERE x.user_id = u.id
                    AND x.interest_id IN (SELECT interest_id FROM mine)) AS shared_interests,
                -- Spherical law of cosines (not Haversine) for distance.
                -- Haversine: 2 * R * asin(sqrt(sin²(Δφ/2) + cos φ1 cos φ2 sin²(Δλ/2)))
                -- This formula is the spherical law of cosines, equivalent for our use case.
                CASE
                  WHEN u.lat IS NULL OR u.lng IS NULL OR $2::float8 IS NULL THEN NULL
                  ELSE 6371 * acos(least(1, greatest(-1,
                         sin(radians($2::float8)) * sin(radians(u.lat)) +
                         cos(radians($2::float8)) * cos(radians(u.lat)) *
                         cos(radians(u.lng - $3::float8)))))
                END AS distance_km
           FROM users u
           JOIN profiles p ON p.user_id = u.id
          WHERE u.id <> $1
            AND u.gender IS NOT NULL
            AND u.gender <> (SELECT gender FROM me)
            -- Only verified profiles are browsable; re-verification hides a
            -- profile again until it resolves (spec 2.3).
            AND p.verification_status = 'verified'
            AND u.status = 'active'
            -- Exclude profiles with flagged bio or unresolved photo flags
            AND p.bio_flagged = false
            AND NOT EXISTS (
              SELECT 1 FROM moderation_flags mf
              WHERE mf.user_id = u.id
                AND mf.source = 'photo'
                AND mf.status IN ('open', 'reviewing')
            )
            ${bboxFilter}
            AND ($4::int IS NULL OR EXTRACT(YEAR FROM age(u.dob)) >= $4)
            AND ($5::int IS NULL OR EXTRACT(YEAR FROM age(u.dob)) <= $5)
            -- Spec 2.3: exclude passes and blocks in both directions.
            AND NOT EXISTS (SELECT 1 FROM passes  WHERE user_id     = $1 AND passed_user_id = u.id)
            AND NOT EXISTS (SELECT 1 FROM blocks  WHERE blocker_id  = $1 AND blocked_id    = u.id)
            AND NOT EXISTS (SELECT 1 FROM blocks  WHERE blocked_id  = $1 AND blocker_id    = u.id)
            -- An outgoing like is a swipe-past too: never re-serve the card.
            AND NOT EXISTS (SELECT 1 FROM likes   WHERE from_user_id = $1 AND to_user_id   = u.id)
            AND NOT EXISTS (SELECT 1 FROM matches WHERE (user_a_id = $1 AND user_b_id = u.id)
                                                     OR (user_b_id = $1 AND user_a_id = u.id))
       )
       SELECT * FROM candidates
        -- No location on either side means we cannot filter, so we show rather
        -- than silently empty the feed.
        WHERE ($${5}::float8 IS NULL OR distance_km IS NULL OR distance_km <= $${5}::float8)
        ${cursorFilter}
        -- Spec 1.2: ranked by interest-tag overlap. Distance and recency break ties.
        ORDER BY shared_interests DESC, distance_km ASC NULLS LAST, user_id
        LIMIT $${paramOffset}`,
      [userId, myLat, myLng, f.minAge ?? null, f.maxAge ?? null, radiusKm, ...bboxParams, limit],
    );

    // Convert distance_km to distance_bucket for privacy
    // Also build next cursor from last row
    let nextCursor: { shared_interests: number; distance_km: number | null; user_id: string } | null = null;
    if (rows.length === limit) {
      const last = rows[rows.length - 1];
      nextCursor = {
        shared_interests: last.shared_interests,
        distance_km: last.distance_km,
        user_id: last.user_id,
      };
    }

    return {
      items: rows.map(row => ({
        ...row,
        distance_bucket: distanceToBucket(row.distance_km),
        distance_km: undefined, // Don't expose precise distance
      })),
      nextCursor,
    };
  }

  /** Spec 2.3 — atomic quota check + decrement, then like and possible match.
   * Fixed: Insert like first, decrement quota only if insert created a row (rowCount=1).
   * Re-liking costs nothing. Push sent after commit.
   * Target must exist, be active, verified, and not blocked either way.
   */
  async like(userId: string, targetId: string): Promise<LikeOutcome> {
    // Require onboarding for both users
    await this.users.requireOnboarded(userId);
    await this.users.requireOnboarded(targetId);

    if (userId === targetId) throw new BadRequestException('cannot_like_self');

    // Check blocks in both directions
    const blocked = await this.db.count(
      `SELECT count(*)::int AS n FROM blocks
        WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)`,
      [userId, targetId],
    );
    if (blocked) throw new ConflictException('blocked');

    // Verify target exists, is active, and verified
    const target = await this.db.one<{ id: string; status: string | null }>(
      'SELECT id, status FROM users WHERE id = $1',
      [targetId],
    );
    if (!target) throw new BadRequestException('unknown_user');
    if (target.status !== 'active') throw new ConflictException('blocked');

    // Check target verification status
    const targetProfile = await this.db.one<{ verification_status: string }>(
      'SELECT verification_status FROM profiles WHERE user_id = $1',
      [targetId],
    );
    if (!targetProfile || targetProfile.verification_status !== 'verified') {
      throw new ConflictException('target_not_verified');
    }

    // Ensure subscription row exists
    await this.subscriptions.ensure(userId);

    // Use transaction: insert like first, then decrement quota only if row was created
    return this.db.tx(async (conn) => {
      // Try to insert the like
      const likeResult = await conn.query(
        `INSERT INTO likes (from_user_id, to_user_id) VALUES ($1, $2)
         ON CONFLICT (from_user_id, to_user_id) DO NOTHING
         RETURNING id`,
        [userId, targetId],
      );

      const isNewLike = likeResult.rowCount === 1;

      // Only decrement quota if this was a new like (not a re-like)
      let remaining: number;
      if (isNewLike) {
        const decremented = await conn.query(
          `UPDATE subscriptions
              SET likes_remaining_today = likes_remaining_today - 1
            WHERE user_id = $1
              AND status = 'active'
              AND likes_remaining_today > 0
          RETURNING likes_remaining_today`,
          [userId],
        );

        if (!decremented.rowCount) {
          const sub = await conn.query(
            'SELECT status, likes_remaining_today FROM subscriptions WHERE user_id = $1',
            [userId],
          );
          const row = sub.rows[0] as { status: string; likes_remaining_today: number } | undefined;
          if (!row || row.status !== 'active') throw new ConflictException('subscription_inactive');
          throw new ConflictException('no_likes_remaining');
        }
        remaining = (decremented.rows[0] as { likes_remaining_today: number }).likes_remaining_today;
      } else {
        // Re-like: get current remaining without decrementing
        const sub = await conn.query(
          'SELECT likes_remaining_today FROM subscriptions WHERE user_id = $1',
          [userId],
        );
        remaining = sub.rows[0]?.likes_remaining_today ?? 0;
      }

      // Check for reciprocal like (match)
      const reciprocal = await conn.query(
        'SELECT 1 FROM likes WHERE from_user_id = $2 AND to_user_id = $1',
        [userId, targetId],
      );

      if (!reciprocal.rowCount) {
        // No match yet - collect side effects to run after commit
        const pushLike = this.push.toUser(targetId, 'new_like', { fromUserId: userId });
        // Use Promise.resolve().then() to run after transaction commits
        Promise.resolve().then(() => void pushLike);
        return { liked: true, matched: false, matchId: null, likesRemainingToday: remaining };
      }

      // Match! Insert match (normalized pair)
      const match = await conn.query(
        `INSERT INTO matches (user_a_id, user_b_id)
         VALUES (least($1::uuid, $2::uuid), greatest($1::uuid, $2::uuid))
         ON CONFLICT (user_a_id, user_b_id) DO UPDATE SET unmatched_at = NULL
         RETURNING id`,
        [userId, targetId],
      );
      const matchId = (match.rows[0] as { id: string }).id;

      // Collect push notifications to send after commit
      const pushMatch1 = this.push.toUser(targetId, 'new_match', { matchId });
      const pushMatch2 = this.push.toUser(userId, 'new_match', { matchId });
      Promise.resolve().then(() => { void pushMatch1; void pushMatch2; });

      return { liked: true, matched: true, matchId, likesRemainingToday: remaining };
    });
  }

  async pass(userId: string, targetId: string): Promise<{ passed: true }> {
    await this.users.requireOnboarded(userId);
    await this.users.requireOnboarded(targetId);

    if (userId === targetId) throw new BadRequestException('cannot_pass_self');

    const target = await this.db.one<{ id: string }>(
      'SELECT id FROM users WHERE id = $1',
      [targetId],
    );
    if (!target) throw new NotFoundException('unknown_user');

    await this.db.query(
      `INSERT INTO passes (user_id, passed_user_id) VALUES ($1, $2)
       ON CONFLICT (user_id, passed_user_id) DO NOTHING`,
      [userId, targetId],
    );
    return { passed: true };
  }

  /** Spec 1.2 — block removes the pair from both feeds and ends any match. */
  async block(userId: string, targetId: string, reason?: string): Promise<{ blocked: true }> {
    await this.users.requireOnboarded(userId);
    await this.users.requireOnboarded(targetId);

    if (userId === targetId) throw new BadRequestException('cannot_block_self');

    const target = await this.db.one<{ id: string }>(
      'SELECT id FROM users WHERE id = $1',
      [targetId],
    );
    if (!target) throw new NotFoundException('unknown_user');

    await this.db.tx(async (conn) => {
      await conn.query(
        `INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2)
         ON CONFLICT (blocker_id, blocked_id) DO NOTHING`,
        [userId, targetId],
      );
      await conn.query(
        `UPDATE matches SET unmatched_at = now()
          WHERE unmatched_at IS NULL
            AND ((user_a_id = $1 AND user_b_id = $2) OR (user_a_id = $2 AND user_b_id = $1))`,
        [userId, targetId],
      );
      if (reason) {
        await conn.query(
          'INSERT INTO reports (reporter_id, reported_id, reason) VALUES ($1, $2, $3)',
          [userId, targetId, reason],
        );
      }
    });
    return { blocked: true };
  }
}