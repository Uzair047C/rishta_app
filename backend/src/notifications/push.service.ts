import { Injectable, Logger } from '@nestjs/common';
import { Db } from '../db/db';
import { firebaseApp } from '../auth/auth';

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

      const { getMessaging } = await import('firebase-admin/messaging');
      const res = await getMessaging(firebaseApp()).sendEachForMulticast({
        tokens: tokens.map((t) => t.token),
        data: { category, ...data },
        android: { priority: 'high' },
        apns: { payload: { aps: { contentAvailable: true } } },
      });

      await this.prune(res.responses, tokens.map((t) => t.token));
    } catch (err) {
      this.log.warn(`push to ${userId} failed: ${String(err)}`);
    }
  }

  /** Drops tokens FCM reports as gone so the table does not grow forever. */
  private async prune(
    responses: { success: boolean; error?: { code?: string } }[],
    tokens: string[],
  ): Promise<void> {
    const dead = tokens.filter((_, i) => {
      const code = responses[i]?.error?.code;
      return (
        code === 'messaging/registration-token-not-registered' ||
        code === 'messaging/invalid-registration-token'
      );
    });
    if (dead.length) await this.db.query('DELETE FROM device_tokens WHERE token = ANY($1)', [dead]);
  }
}
