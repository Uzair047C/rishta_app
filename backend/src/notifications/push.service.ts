import { Injectable, Logger } from '@nestjs/common';
import type { SendResponse } from 'firebase-admin/messaging';
import { Db } from '../db/db';

export type PushCategory = 'new_like' | 'new_match' | 'new_message';

/** Typed map, so the preference column is never built from caller input. */
const PREFERENCE_COLUMN: Record<PushCategory, string> = {
  new_like: 'new_like',
  new_match: 'new_match',
  new_message: 'new_message',
};

/** FCM errors that mean "this token is dead, stop sending to it." */
const DEAD_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);

/** Push copy per category. Generic on purpose: no other users' PII in pushes. */
const BODY: Record<PushCategory, string> = {
  new_like: 'Someone liked your profile.',
  new_match: 'You have a new match. Say hello!',
  new_message: 'You have a new message.',
};

const TITLE: Record<PushCategory, string> = {
  new_like: 'New like!',
  new_match: "It's a match!",
  new_message: 'New message!',
};

@Injectable()
export class PushService {
  private readonly log = new Logger(PushService.name);

  constructor(private readonly db: Db) {}

  /** Lazy, like StreamService's client: missing Firebase app throws at send time, not boot. */
  private get messaging() {
    return require('firebase-admin/messaging').getMessaging();
  }

  /**
   * Spec 1.2/2.1 — triggered server-side on like/match/message. Respects the
   * recipient's per-category toggle and never throws: a push failure must not
   * fail the like that caused it.
   *
   * Sends via FCM (sendEachForMulticast) using the Firebase app the auth
   * service already initialized; dead tokens are pruned from FCM feedback.
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

      const res = await this.messaging.sendEachForMulticast({
        notification: { title: TITLE[category], body: BODY[category] },
        data: { type: category, ...data },
        tokens: tokens.map((t) => t.token),
      });

      const responses: SendResponse[] = res.responses;
      // flatMap, not filter+map: the index must stay the original response index.
      const dead = responses.flatMap((r, i) =>
        !r.success && r.error?.code && DEAD_TOKEN_CODES.has(r.error.code) ? [tokens[i].token] : [],
      );
      await this.prune(dead);
    } catch (err) {
      this.log.warn(`push to ${userId} failed: ${String(err)}`);
    }
  }

  /** Drops tokens FCM reported as no longer valid so the table does not grow forever. */
  private async prune(dead: string[]): Promise<void> {
    if (dead.length) await this.db.query('DELETE FROM device_tokens WHERE token = ANY($1)', [dead]);
  }
}
