import { Controller, Delete, Get, NotFoundException, Param, ParseUUIDPipe } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
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

  /** Spec 1.2 — unmatch is distinct from report/block; it only ends the match. */
  @Delete(':id')
  async unmatch(@CurrentUser() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    const user = await this.users.require(userId);
    const updated = await this.db.query(
      `UPDATE matches SET unmatched_at = now()
        WHERE id = $1 AND unmatched_at IS NULL AND (user_a_id = $2 OR user_b_id = $2)
        RETURNING id`,
      [id, user.id],
    );
    if (!updated.rowCount) throw new NotFoundException('match_not_found');
    return { unmatched: true, matchId: id };
  }
}
