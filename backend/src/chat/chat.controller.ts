import { Controller, Post, Headers, Req, HttpCode, HttpStatus } from '@nestjs/common';
import { Request } from 'express';
import { Public } from '../auth/public.decorator';
import { StreamService } from './stream.service';
import { ModerationService } from '../moderation/moderation.service';
import { PushService } from '../notifications/push.service';
import { Db } from '../db/db';

/**
 * Spec 2.5 — text moderation ships with chat (§2.6.5), not after payments.
 * Stream delivers message events here; new messages run through the same
 * screenText pipeline as bios so flagged messages land in the human review
 * queue. Signature-verified via the Stream SDK; anything unverified or
 * unparseable returns 200 (Stream retries add no value on a permanent reject).
 */
@Controller('chat')
export class ChatController {
  constructor(
    private readonly stream: StreamService,
    private readonly moderation: ModerationService,
    private readonly push: PushService,
    private readonly db: Db,
  ) {}

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('webhook')
  async webhook(@Req() req: Request, @Headers('x-signature') signature?: string) {
    const event = this.stream.verifyWebhook(req.body as Buffer, signature);
    if (!event) return { ok: true };

    if (event.type === 'message.new' && event.message?.user?.id && event.message.text) {
      const senderId = event.message.user.id;
      // refId ties the flag row to the Stream message for the review queue.
      const screen = await this.moderation.screenText(event.message.text, senderId, 'message', event.message.id);

      // Spec 6 — notify the other match participant. Flagged messages skip the
      // push: a user under review must not be able to spam the recipient.
      if (!screen.flagged && event.channel_id?.startsWith('match-')) {
        const matchId = event.channel_id.slice('match-'.length);
        const match = await this.db.oneOrNone<{ user_a_id: string; user_b_id: string }>(
          'SELECT user_a_id, user_b_id FROM matches WHERE id = $1',
          [matchId],
        );
        if (match) {
          const recipientId = match.user_a_id === senderId ? match.user_b_id : match.user_a_id;
          if (recipientId !== senderId) {
            await this.push.toUser(recipientId, 'new_message', { matchId, fromUserId: senderId });
          }
        }
      }
    }
    return { ok: true };
  }
}
