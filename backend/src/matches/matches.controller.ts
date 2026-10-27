import { Controller, Delete, Get, NotFoundException, Param, ParseUUIDPipe } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { UsersService } from '../users/users.service';
import { Db } from '../db/db';

@Controller('matches')
export class MatchesController {
  constructor(
    private readonly db: Db,
    private readonly users: UsersService,
  ) {}

  @Get()
  async list(@CurrentUser() userId: string) {
    const user = await this.users.requireOnboarded(userId);
    const matches = await this.db.all(
      `SELECT m.id AS match_id, m.matched_at,
              u.id AS user_id, u.gender, u.location,
              EXTRACT(YEAR FROM age(u.dob))::int AS age,
              p.name, p.bio, p.photos, p.verification_status
         FROM matches m
         JOIN users u
           ON u.id = CASE WHEN m.user_a_id = $1 THEN m.user_b_id ELSE m.user_a_id END
         JOIN profiles p ON p.user_id = u.id
        WHERE (m.user_a_id = $1 OR m.user_b_id = $1)
          AND m.unmatched_at IS NULL
          AND NOT EXISTS (
                SELECT 1 FROM blocks b
                 WHERE (b.blocker_id = $1 AND b.blocked_id = u.id)
                    OR (b.blocked_id = $1 AND b.blocker_id = u.id))
        ORDER BY m.matched_at DESC`,
      [user.id],
    );
    return { matches };
  }

  /** Spec 1.2 — unmatch is distinct from report/block; it only ends the match.
   * Fixed: On unmatch, delete both directed likes so match cannot be revived via like flow.
   * This prevents the bug where ON CONFLICT SET unmatched_at = NULL would revive a match.
   */
  @Delete(':id')
  async unmatch(@CurrentUser() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    const user = await this.users.requireOnboarded(userId);

    // First get the match to find both user IDs
    const match = await this.db.one<{ user_a_id: string; user_b_id: string }>(
      `SELECT user_a_id, user_b_id FROM matches WHERE id = $1 AND unmatched_at IS NULL AND (user_a_id = $2 OR user_b_id = $2)`,
      [id, user.id],
    );
    if (!match) throw new NotFoundException('match_not_found');

    // Delete the match and both directed likes in a transaction
    await this.db.tx(async (conn) => {
      // Set unmatched_at on the match
      await conn.query(
        `UPDATE matches SET unmatched_at = now() WHERE id = $1`,
        [id],
      );

      // Delete both directed likes to prevent revival
      await conn.query(
        `DELETE FROM likes
         WHERE (from_user_id = $1 AND to_user_id = $2)
            OR (from_user_id = $2 AND to_user_id = $1)`,
        [match.user_a_id, match.user_b_id],
      );
    });

    return { unmatched: true, matchId: id };
  }
}