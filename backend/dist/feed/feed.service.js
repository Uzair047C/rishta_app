"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FeedService = void 0;
const common_1 = require("@nestjs/common");
const db_1 = require("../db/db");
const push_service_1 = require("../notifications/push.service");
const subscription_service_1 = require("../subscription/subscription.service");
/**
 * Feed + interactions. The quota decrement and the candidate query are the two
 * pieces of logic the spec calls out as race- and correctness-sensitive, so they
 * are kept as literal SQL here rather than built up through the Repo helper.
 */
let FeedService = class FeedService {
    db;
    push;
    subscriptions;
    constructor(db, push, subscriptions) {
        this.db = db;
        this.push = push;
        this.subscriptions = subscriptions;
    }
    async feed(user, f) {
        const limit = Math.min(Math.max(f.limit ?? 20, 1), 50);
        const offset = Math.max(f.offset ?? 0, 0);
        return this.db.all(`WITH me AS (SELECT gender, lat, lng FROM users WHERE id = $1),
            mine AS (SELECT interest_id FROM user_interests WHERE user_id = $1),
            candidates AS (
         SELECT u.id AS user_id, u.gender, u.location,
                EXTRACT(YEAR FROM age(u.dob))::int AS age,
                p.name, p.bio, p.profession, p.education, p.marital_status, p.photos,
                p.verification_status,
                (SELECT count(*)::int FROM user_interests x
                  WHERE x.user_id = u.id
                    AND x.interest_id IN (SELECT interest_id FROM mine)) AS shared_interests,
                -- Haversine inline rather than the earthdistance extension: same
                -- result, no extension to provision on a managed Postgres.
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
        WHERE ($6::float8 IS NULL OR distance_km IS NULL OR distance_km <= $6::float8)
        -- Spec 1.2: ranked by interest-tag overlap. Distance and recency break ties.
        ORDER BY shared_interests DESC, distance_km ASC NULLS LAST, user_id
        LIMIT $7 OFFSET $8`, [user.id, user.lat, user.lng, f.minAge ?? null, f.maxAge ?? null, f.radiusKm ?? null, limit, offset]);
    }
    /** Spec 2.3 — atomic quota check + decrement, then like and possible match. */
    async like(user, targetId) {
        if (user.id === targetId)
            throw new common_1.BadRequestException('cannot_like_self');
        const blocked = await this.db.count(`SELECT count(*)::int AS n FROM blocks
        WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)`, [user.id, targetId]);
        if (blocked)
            throw new common_1.ConflictException('blocked');
        const target = await this.db.one('SELECT id FROM users WHERE id = $1', [targetId]);
        if (!target)
            throw new common_1.BadRequestException('unknown_user');
        // A user who has never opened the subscription screen has no row yet, and
        // the decrement below would report zero rows as "inactive".
        await this.subscriptions.ensure(user.id);
        return this.db.tx(async (conn) => {
            // Never read-then-write: the WHERE clause is the concurrency control, so a
            // double-tap can only ever consume one like.
            const decremented = await conn.query(`UPDATE subscriptions
            SET likes_remaining_today = likes_remaining_today - 1
          WHERE user_id = $1
            AND status = 'active'
            AND likes_remaining_today > 0
        RETURNING likes_remaining_today`, [user.id]);
            if (!decremented.rowCount) {
                // Zero rows is ambiguous, so ask why once the write has already failed.
                const sub = await conn.query('SELECT status, likes_remaining_today FROM subscriptions WHERE user_id = $1', [user.id]);
                const row = sub.rows[0];
                if (!row || row.status !== 'active')
                    throw new common_1.ConflictException('subscription_inactive');
                throw new common_1.ConflictException('no_likes_remaining');
            }
            await conn.query(`INSERT INTO likes (from_user_id, to_user_id) VALUES ($1, $2)
         ON CONFLICT (from_user_id, to_user_id) DO NOTHING`, [user.id, targetId]);
            const reciprocal = await conn.query('SELECT 1 FROM likes WHERE from_user_id = $2 AND to_user_id = $1', [user.id, targetId]);
            if (!reciprocal.rowCount) {
                const remaining = decremented.rows[0].likes_remaining_today;
                // Fire-and-forget outside the transaction would be better once volume
                // justifies a queue; inline keeps it simple at MVP.
                void this.push.toUser(targetId, 'new_like', { fromUserId: user.id });
                return { liked: true, matched: false, matchId: null, likesRemainingToday: remaining };
            }
            // Pair is stored normalized so the UNIQUE index prevents a duplicate match.
            const match = await conn.query(`INSERT INTO matches (user_a_id, user_b_id)
         VALUES (least($1::uuid, $2::uuid), greatest($1::uuid, $2::uuid))
         ON CONFLICT (user_a_id, user_b_id) DO UPDATE SET unmatched_at = NULL
         RETURNING id`, [user.id, targetId]);
            const matchId = match.rows[0].id;
            void this.push.toUser(targetId, 'new_match', { matchId });
            void this.push.toUser(user.id, 'new_match', { matchId });
            const remaining = decremented.rows[0].likes_remaining_today;
            return { liked: true, matched: true, matchId, likesRemainingToday: remaining };
        });
    }
    async pass(user, targetId) {
        if (user.id === targetId)
            throw new common_1.BadRequestException('cannot_pass_self');
        await this.db.query(`INSERT INTO passes (user_id, passed_user_id) VALUES ($1, $2)
       ON CONFLICT (user_id, passed_user_id) DO NOTHING`, [user.id, targetId]);
        return { passed: true };
    }
    /** Spec 1.2 — block removes the pair from both feeds and ends any match. */
    async block(user, targetId, reason) {
        if (user.id === targetId)
            throw new common_1.BadRequestException('cannot_block_self');
        await this.db.tx(async (conn) => {
            await conn.query(`INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2)
         ON CONFLICT (blocker_id, blocked_id) DO NOTHING`, [user.id, targetId]);
            await conn.query(`UPDATE matches SET unmatched_at = now()
          WHERE unmatched_at IS NULL
            AND ((user_a_id = $1 AND user_b_id = $2) OR (user_a_id = $2 AND user_b_id = $1))`, [user.id, targetId]);
            if (reason) {
                await conn.query('INSERT INTO reports (reporter_id, reported_id, reason) VALUES ($1, $2, $3)', [user.id, targetId, reason]);
            }
        });
        return { blocked: true };
    }
};
exports.FeedService = FeedService;
exports.FeedService = FeedService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [db_1.Db,
        push_service_1.PushService,
        subscription_service_1.SubscriptionService])
], FeedService);
//# sourceMappingURL=feed.service.js.map