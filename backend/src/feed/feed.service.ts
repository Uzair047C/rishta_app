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
  cursor?: string; // Opaque base64-encoded cursor
  religiousPracticeLevel?: string;
  sect?: string;
  maritalStatus?: string;
  education?: string;
  city?: string;
}

export interface FeedResult {
  items: FeedCard[];
  nextCursor: string | null;
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

/** Tiny parameter builder: each call returns the next $n placeholder. */
class ParamBuilder {
  private n = 0;
  add(): string {
    this.n++;
    return `$${this.n}`;
  }
  get count(): number {
    return this.n;
  }
}

/** Decoded cursor for keyset pagination. */
interface DecodedCursor {
  shared_interests: number;
  distance_m: number | null;
  user_id: string;
}

function encodeCursor(c: DecodedCursor): string {
  return Buffer.from(JSON.stringify(c)).toString('base64');
}

function decodeCursor(s: string): DecodedCursor | null {
  try {
    const parsed = JSON.parse(Buffer.from(s, 'base64').toString());
    if (
      typeof parsed.shared_interests === 'number' &&
      (parsed.distance_m === null || typeof parsed.distance_m === 'number') &&
      typeof parsed.user_id === 'string'
    ) {
      return parsed;
    }
  } catch {}
  return null;
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
    // Validate filters
    if (f.minAge !== undefined && f.minAge < 18) {
      throw new BadRequestException('minAge must be at least 18');
    }
    if (f.maxAge !== undefined && f.maxAge < (f.minAge ?? 18)) {
      throw new BadRequestException('maxAge must be >= minAge');
    }
    if (f.radiusKm !== undefined && (f.radiusKm < 1 || f.radiusKm > 500)) {
      throw new BadRequestException('radiusKm must be between 1 and 500');
    }
    const limit = Math.min(Math.max(f.limit ?? 20, 1), 50);

    // Get current user's lat/lng, gender, dob
    const me = await this.db.one<{
      gender: string;
      lat: number | null;
      lng: number | null;
      dob: Date | null;
    }>('SELECT gender, lat, lng, dob FROM users WHERE id = $1', [userId]);

    if (!me) {
      throw new NotFoundException('User not found');
    }

    const myLat = me.lat;
    const myLng = me.lng;
    const radiusKm = f.radiusKm ?? null;

    // Calculate dob range for age filters (sargable)
    let minDob: Date | null = null;
    let maxDob: Date | null = null;
    const now = new Date();
    if (f.maxAge !== undefined) {
      minDob = new Date(now.getFullYear() - f.maxAge, now.getMonth(), now.getDate());
    }
    if (f.minAge !== undefined) {
      maxDob = new Date(now.getFullYear() - f.minAge, now.getMonth(), now.getDate());
    }

    const p = new ParamBuilder();
    // Base params: userId, myLat, myLng, minDob, maxDob, radiusKm
    p.add(); // $1 userId
    p.add(); // $2 myLat
    p.add(); // $3 myLng
    p.add(); // $4 minDob
    p.add(); // $5 maxDob
    p.add(); // $6 radiusKm

    const params: unknown[] = [userId, myLat, myLng, minDob, maxDob, radiusKm];

    // Optional bbox prefilter using PostGIS (helps the GiST index)
    let geoFilter = '';
    if (myLat !== null && myLng !== null && radiusKm !== null) {
      const lngParam = p.add();
      const latParam = p.add();
      const distParam = p.add();
      geoFilter = `AND u.geo IS NOT NULL AND ST_DWithin(u.geo, ST_SetSRID(ST_MakePoint($${lngParam}, $${latParam}), 4326)::geography, $${distParam})`;
      params.push(myLng, myLat, radiusKm * 1000);
    }

    // Profile filters
    let profileFilter = '';
    if (f.religiousPracticeLevel) {
      const rp = p.add();
      profileFilter += ` AND p.religious_practice_level = $${rp}`;
      params.push(f.religiousPracticeLevel);
    }
    if (f.sect) {
      const s = p.add();
      profileFilter += ` AND p.sect = $${s}`;
      params.push(f.sect);
    }
    if (f.maritalStatus) {
      const ms = p.add();
      profileFilter += ` AND p.marital_status = $${ms}`;
      params.push(f.maritalStatus);
    }
    if (f.education) {
      const ed = p.add();
      profileFilter += ` AND p.education = $${ed}`;
      params.push(f.education);
    }
    if (f.city) {
      const ct = p.add();
      profileFilter += ` AND p.city = $${ct}`;
      params.push(f.city);
    }

    // Cursor filter
    let cursorFilter = '';
    const decodedCursor = f.cursor ? decodeCursor(f.cursor) : null;
    if (decodedCursor) {
      const si = p.add();
      const dm = p.add();
      const uid = p.add();
      cursorFilter = `
        AND (
          shared_interests < $${si}
          OR (shared_interests = $${si} AND COALESCE(distance_m, 999999999) > $${dm})
          OR (shared_interests = $${si} AND COALESCE(distance_m, 999999999) = $${dm} AND user_id > $${uid})
        )`;
      params.push(decodedCursor.shared_interests, decodedCursor.distance_m, decodedCursor.user_id);
    }

    // Seeking filter: mutual seeking (gender vs seeking)
    const seekingFilter = `
      AND (p.seeking = 'any' OR p.seeking = (SELECT gender FROM users WHERE id = $1))
      AND ((SELECT seeking FROM profiles WHERE user_id = $1) = 'any' OR (SELECT seeking FROM profiles WHERE user_id = $1) = u.gender)
    `;

    // Build the query
    const query = `
      WITH me AS (SELECT $1::uuid AS user_id, $2::float8 AS lat, $3::float8 AS lng),
           mine AS (SELECT interest_id FROM user_interests WHERE user_id = $1),
           candidates AS (
        SELECT u.id AS user_id, u.gender, u.dob, u.location, u.lat, u.lng,
               p.name, p.bio, p.profession, p.education, p.marital_status, p.city,
               p.religious_practice_level, p.sect, p.photos, p.verification_status,
               (SELECT count(*)::int FROM user_interests x
                 WHERE x.user_id = u.id
                   AND x.interest_id IN (SELECT interest_id FROM mine)) AS shared_interests,
               CASE
                 WHEN u.geo IS NULL OR $2 IS NULL OR $3 IS NULL THEN NULL
                 ELSE ST_Distance(u.geo, ST_SetSRID(ST_MakePoint($3, $2), 4326)::geography)
               END AS distance_m
        FROM users u
        JOIN profiles p ON p.user_id = u.id
       WHERE u.id <> $1
         AND u.gender IS NOT NULL
         AND u.gender <> (SELECT gender FROM me)
         AND p.verification_status = 'verified'
         AND u.status = 'active'
         AND p.bio_flagged = false
         AND NOT EXISTS (
           SELECT 1 FROM moderation_flags mf
           WHERE mf.user_id = u.id
             AND mf.source = 'photo'
             AND mf.status IN ('open', 'reviewing')
         )
         ${geoFilter}
         ${profileFilter}
         AND ($4 IS NULL OR u.dob >= $4)
         AND ($5 IS NULL OR u.dob <= $5)
         AND NOT EXISTS (SELECT 1 FROM passes WHERE user_id = $1 AND passed_user_id = u.id)
         AND NOT EXISTS (SELECT 1 FROM blocks WHERE blocker_id = $1 AND blocked_id = u.id)
         AND NOT EXISTS (SELECT 1 FROM blocks WHERE blocked_id = $1 AND blocker_id = u.id)
         AND NOT EXISTS (SELECT 1 FROM likes WHERE from_user_id = $1 AND to_user_id = u.id)
         AND NOT EXISTS (SELECT 1 FROM matches WHERE (user_a_id = $1 AND user_b_id = u.id) OR (user_b_id = $1 AND user_a_id = u.id))
         ${seekingFilter}
      )
      SELECT * FROM candidates
       WHERE ($6 IS NULL OR distance_m IS NULL OR distance_m <= $6 * 1000)
         ${cursorFilter}
       ORDER BY shared_interests DESC, distance_m ASC NULLS LAST, user_id
       LIMIT $${p.add()}
    `;

    params.push(limit);

    const rows = await this.db.all<any>(query, params);

    // Convert distance_m to distance_bucket for privacy
    // Also build next cursor from last row
    let nextCursor: string | null = null;
    if (rows.length === limit) {
      const last = rows[rows.length - 1];
      nextCursor = encodeCursor({
        shared_interests: last.shared_interests,
        distance_m: last.distance_m,
        user_id: last.user_id,
      });
    }

    return {
      items: rows.map(row => ({
        ...row,
        distance_bucket: distanceToBucket(row.distance_m ? row.distance_m / 1000 : null),
        distance_m: undefined, // Don't expose precise distance
        distance_km: undefined,
      })),
      nextCursor,
    };
  }

  /** Spec 2.3 — atomic quota check + decrement, then like and possible match.
   * All checks inside transaction with advisory lock for mutual-like race.
   * Re-liking costs nothing. Push notifications via outbox after commit.
   * Target must exist, be active, verified, and not blocked either way.
   * Unmatched pairs cannot re-match (returns 409 previously_unmatched).
   */
  async like(userId: string, targetId: string): Promise<LikeOutcome> {
    if (userId === targetId) throw new BadRequestException('cannot_like_self');

    // Ensure subscription row exists before transaction (cheap, no lock)
    await this.subscriptions.ensure(userId);

    return this.db.tx(async (conn) => {
      // 1. Advisory lock on the unordered pair to serialize mutual likes
      await conn.query(
        `SELECT pg_advisory_xact_lock(hashtextextended(least($1,$2)::text || greatest($1,$2)::text, 0))`,
        [userId, targetId],
      );

      // 2. Check onboarding for both users (inside transaction)
      const [userOnboarded, targetOnboarded] = await Promise.all([
        conn.oneOrNone<{ '?column?': number }>('SELECT 1 FROM profiles WHERE user_id = $1 AND name IS NOT NULL AND photos IS NOT NULL AND array_length(photos, 1) > 0', [userId]),
        conn.oneOrNone<{ '?column?': number }>('SELECT 1 FROM profiles WHERE user_id = $1 AND name IS NOT NULL AND photos IS NOT NULL AND array_length(photos, 1) > 0', [targetId]),
      ]);
      if (!userOnboarded || !targetOnboarded) {
        throw new BadRequestException('profile_incomplete');
      }
      const [userGender, targetGender] = await Promise.all([
        conn.oneOrNone<{ gender: string }>('SELECT gender FROM users WHERE id = $1', [userId]),
        conn.oneOrNone<{ gender: string }>('SELECT gender FROM users WHERE id = $1', [targetId]),
      ]);
      if (!userGender?.gender || !targetGender?.gender) {
        throw new BadRequestException('profile_incomplete');
      }

      // 3. Check blocks in both directions (inside transaction)
      const blockedResult = await conn.one<{ n: number }>(
        `SELECT count(*)::int AS n FROM blocks
         WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)`,
        [userId, targetId],
      );
      const blocked = blockedResult?.n ?? 0;
      if (blocked) throw new ConflictException('unavailable'); // No info leak

      // 4. Verify target exists, is active, and verified (inside transaction)
      const target = await conn.oneOrNone<{ id: string; status: string | null }>(
        'SELECT id, status FROM users WHERE id = $1',
        [targetId],
      );
      if (!target) throw new BadRequestException('unknown_user');
      if (target.status !== 'active') throw new ConflictException('unavailable'); // No info leak

      const targetProfile = await conn.oneOrNone<{ verification_status: string }>(
        'SELECT verification_status FROM profiles WHERE user_id = $1',
        [targetId],
      );
      if (!targetProfile || targetProfile.verification_status !== 'verified') {
        throw new ConflictException('target_not_verified');
      }

      // 5. Check if pair was previously unmatched
      const existingMatch = await conn.oneOrNone<{ id: string; unmatched_at: Date | null; unmatched_by: string | null }>(
        `SELECT id, unmatched_at, unmatched_by FROM matches
         WHERE (user_a_id = $1 AND user_b_id = $2) OR (user_a_id = $2 AND user_b_id = $1)`,
        [userId, targetId],
      );
      if (existingMatch?.unmatched_at) {
        throw new ConflictException('previously_unmatched');
      }

      // 6. Try to insert the like
      const likeResult = await conn.query(
        `INSERT INTO likes (from_user_id, to_user_id) VALUES ($1, $2)
         ON CONFLICT (from_user_id, to_user_id) DO NOTHING
         RETURNING id`,
        [userId, targetId],
      );

      const isNewLike = likeResult.rowCount === 1;

      // 7. Only decrement quota if this was a new like (not a re-like)
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

      // 8. Check for reciprocal like (match)
      const reciprocal = await conn.query(
        'SELECT 1 FROM likes WHERE from_user_id = $2 AND to_user_id = $1',
        [userId, targetId],
      );

      if (!reciprocal.rowCount) {
        // No match yet - queue push notification in outbox
        await conn.query(
          `INSERT INTO outbox (type, payload) VALUES ($1, $2)`,
          ['new_like', JSON.stringify({ fromUserId: userId, toUserId: targetId })],
        );
        return { liked: true, matched: false, matchId: null, likesRemainingToday: remaining };
      }

      // 9. Match! Insert match (normalized pair) - don't revive unmatched
      const match = await conn.query(
        `INSERT INTO matches (user_a_id, user_b_id)
         VALUES (least($1::uuid, $2::uuid), greatest($1::uuid, $2::uuid))
         ON CONFLICT (user_a_id, user_b_id) DO NOTHING
         RETURNING id`,
        [userId, targetId],
      );

      let matchId: string;
      if (match.rowCount === 1) {
        matchId = (match.rows[0] as { id: string }).id;
      } else {
        // Race: another transaction created the match, fetch it
        const existing = await conn.one<{ id: string }>(
          `SELECT id FROM matches WHERE (user_a_id = $1 AND user_b_id = $2) OR (user_a_id = $2 AND user_b_id = $1)`,
          [userId, targetId],
        );
        if (!existing) throw new Error('Match not found after race');
        matchId = existing.id;
      }

      // 10. Queue push notifications in outbox
      await conn.query(
        `INSERT INTO outbox (type, payload) VALUES ($1, $2)`,
        ['new_match', JSON.stringify({ matchId, userIds: [userId, targetId] })],
      );

      return { liked: true, matched: true, matchId, likesRemainingToday: remaining };
    });
  }

  async pass(userId: string, targetId: string): Promise<{ passed: true }> {
    if (userId === targetId) throw new BadRequestException('cannot_pass_self');

    // Use the same validation as like (inside transaction for consistency)
    return this.db.tx(async (conn) => {
      // Advisory lock on the pair
      await conn.query(
        `SELECT pg_advisory_xact_lock(hashtextextended(least($1,$2)::text || greatest($1,$2)::text, 0))`,
        [userId, targetId],
      );

      // Check onboarding for both users
      const [userOnboarded, targetOnboarded] = await Promise.all([
        conn.oneOrNone<{ '?column?': number }>('SELECT 1 FROM profiles WHERE user_id = $1 AND name IS NOT NULL AND photos IS NOT NULL AND array_length(photos, 1) > 0', [userId]),
        conn.oneOrNone<{ '?column?': number }>('SELECT 1 FROM profiles WHERE user_id = $1 AND name IS NOT NULL AND photos IS NOT NULL AND array_length(photos, 1) > 0', [targetId]),
      ]);
      if (!userOnboarded || !targetOnboarded) {
        throw new BadRequestException('profile_incomplete');
      }
      const [userGender, targetGender] = await Promise.all([
        conn.oneOrNone<{ gender: string }>('SELECT gender FROM users WHERE id = $1', [userId]),
        conn.oneOrNone<{ gender: string }>('SELECT gender FROM users WHERE id = $1', [targetId]),
      ]);
      if (!userGender?.gender || !targetGender?.gender) {
        throw new BadRequestException('profile_incomplete');
      }

      // Verify target exists
      const target = await conn.oneOrNone<{ id: string }>(
        'SELECT id FROM users WHERE id = $1',
        [targetId],
      );
      if (!target) throw new NotFoundException('unknown_user');

      // Insert pass
      await conn.query(
        `INSERT INTO passes (user_id, passed_user_id) VALUES ($1, $2)
         ON CONFLICT (user_id, passed_user_id) DO NOTHING`,
        [userId, targetId],
      );
      return { passed: true };
    });
  }

  /** Spec 1.2 — block removes the pair from both feeds and ends any match. */
  async block(userId: string, targetId: string, reason?: string): Promise<{ blocked: true }> {
    if (userId === targetId) throw new BadRequestException('cannot_block_self');

    return this.db.tx(async (conn) => {
      // Advisory lock on the pair
      await conn.query(
        `SELECT pg_advisory_xact_lock(hashtextextended(least($1,$2)::text || greatest($1,$2)::text, 0))`,
        [userId, targetId],
      );

      // Check onboarding for both users
      const [userOnboarded, targetOnboarded] = await Promise.all([
        conn.oneOrNone<{ '?column?': number }>('SELECT 1 FROM profiles WHERE user_id = $1 AND name IS NOT NULL AND photos IS NOT NULL AND array_length(photos, 1) > 0', [userId]),
        conn.oneOrNone<{ '?column?': number }>('SELECT 1 FROM profiles WHERE user_id = $1 AND name IS NOT NULL AND photos IS NOT NULL AND array_length(photos, 1) > 0', [targetId]),
      ]);
      if (!userOnboarded || !targetOnboarded) {
        throw new BadRequestException('profile_incomplete');
      }
      const [userGender, targetGender] = await Promise.all([
        conn.oneOrNone<{ gender: string }>('SELECT gender FROM users WHERE id = $1', [userId]),
        conn.oneOrNone<{ gender: string }>('SELECT gender FROM users WHERE id = $1', [targetId]),
      ]);
      if (!userGender?.gender || !targetGender?.gender) {
        throw new BadRequestException('profile_incomplete');
      }

      // Verify target exists
      const target = await conn.oneOrNone<{ id: string }>(
        'SELECT id FROM users WHERE id = $1',
        [targetId],
      );
      if (!target) throw new NotFoundException('unknown_user');

      // 1. Insert block
      await conn.query(
        `INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2)
         ON CONFLICT (blocker_id, blocked_id) DO NOTHING`,
        [userId, targetId],
      );

      // 2. Remove pending likes in both directions
      await conn.query(
        `DELETE FROM likes
         WHERE (from_user_id = $1 AND to_user_id = $2)
            OR (from_user_id = $2 AND to_user_id = $1)`,
        [userId, targetId],
      );

      // 3. Unmatch if matched
      await conn.query(
        `UPDATE matches SET unmatched_at = now(), unmatched_by = $1
          WHERE unmatched_at IS NULL
            AND ((user_a_id = $1 AND user_b_id = $2) OR (user_a_id = $2 AND user_b_id = $1))`,
        [userId, targetId],
      );

      // 4. Create report with dedupe if reason provided
      if (reason) {
        await conn.query(
          `INSERT INTO reports (reporter_id, reported_id, reason)
           VALUES ($1, $2, $3)
           ON CONFLICT (reporter_id, reported_id, status) WHERE status = 'open' DO NOTHING`,
          [userId, targetId, reason],
        );
      }
      return { blocked: true };
    });
  }
}