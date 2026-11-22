import { Controller, Post, Headers, Req, HttpCode, HttpStatus } from '@nestjs/common';
import { Request } from 'express';
import { Public } from '../auth/public.decorator';
import { StreamService } from './stream.service';
import { ModerationService } from '../moderation/moderation.service';

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
  ) {}

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('webhook')
  async webhook(@Req() req: Request, @Headers('x-signature') signature?: string) {
    const event = this.stream.verifyWebhook(req.body as Buffer, signature);
    if (!event) return { ok: true };

    if (event.type === 'message.new' && event.message?.user?.id && event.message.text) {
      // refId ties the flag row to the Stream message for the review queue.
      await this.moderation.screenText(event.message.text, event.message.user.id, 'message', event.message.id);
    }
    return { ok: true };
  }
}
