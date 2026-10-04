import { Injectable, Logger } from '@nestjs/common';
import { Db } from '../db/db';

export type PushCategory = 'new_like' | 'new_match' | 'new_message';

/** Typed map, so the preference column is never built from caller input. */
const PREFERENCE_COLUMN: Record<PushCategory, string> = {
  new_like: 'new_like',
  new_match: 'new_match',
  new_message: 'new_message',
};

@Injectable()
export class PushService {
  private readonly log = new Logger(PushService.name);

  constructor(private readonly db: Db) {}

  /**
   * Spec 1.2/2.1 — triggered server-side on like/match/message. Respects the
   * recipient's per-category toggle and never throws: a push failure must not
   * fail the like that caused it.
   *
   * With Firebase removed, push notifications are simulated in development.
   * In production, you would integrate with another push notification service
   * (like AWS SNS, APNs directly, or a custom webhook).
   */
  async toUser(userId: string, category: PushCategory, data: Record<string, string>): Promise<void> {
    try {
      const prefs = await this.db.one<Record<string, boolean>>(
        'SELECT * FROM notification_preferences WHERE user_id = $1',
        [userId],
      );
      const column = PREFERENCE_COLUMN[category];
      // Absent row means "never touched the screen" -> defaults apply, which are on.
      if (prefs && prefs[column] === false) return;

      const tokens = await this.db.all<{ token: string }>(
        'SELECT token FROM device_tokens WHERE user_id = $1',
        [userId],
      );
      if (!tokens.length) return;

      // Simulate push notification sending for development
      // In production without Firebase, implement actual push notification logic here
      this.log.debug(`Push notification simulated: userId=${userId}, category=${category}, data=${JSON.stringify(data)}, tokenCount=${tokens.length}`);

      // Simulate pruning invalid tokens (in real implementation, this would come from push service feedback)
      await this.prune([], tokens.map((t) => t.token));
    } catch (err) {
      this.log.warn(`push to ${userId} failed: ${String(err)}`);
    }
  }

  /** Drops tokens that are no longer valid so the table does not grow forever. */
  private async prune(
    responses: { success: boolean; error?: { code?: string } }[],
    tokens: string[],
  ): Promise<void> {
    // Simulate token validation - in real implementation, analyze push service responses
    // For now, we'll just validate that tokens are not empty strings
    const dead = tokens.filter(token => !token || token.trim() === '');
    if (dead.length) await this.db.query('DELETE FROM device_tokens WHERE token = ANY($1)', [dead]);
  }
}
