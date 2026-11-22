import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Server-side Stream Chat access: one lazy client shared by token issue,
 * channel teardown and webhook signature verification. The client is required
 * lazily (same pattern AuthService used) so a missing/broken SDK surfaces as a
 * runtime config error, not a boot failure.
 */
@Injectable()
export class StreamService {
  private readonly log = new Logger(StreamService.name);
  private client: any = null;

  constructor(private readonly config: ConfigService) {}

  private getClient() {
    if (!this.client) {
      const key = this.config.get<string>('STREAM_API_KEY');
      const secret = this.config.get<string>('STREAM_API_SECRET');
      if (!key || !secret) throw new Error('Stream Chat not configured');
      const { StreamChat } = require('stream-chat');
      this.client = StreamChat.getInstance(key, secret);
    }
    return this.client;
  }

  /** Spec 2.1 — tokens are issued only after Firebase auth (caller: /auth/stream-token). */
  async issueToken(userId: string): Promise<{ token: string; expiresAt: number }> {
    const client = this.getClient();
    await client.upsertUser({ id: userId, role: 'user' });
    return { token: client.createToken(userId), expiresAt: Math.floor(Date.now() / 1000) + 3600 };
  }

  /** Spec 2.6.5 — block/unmatch must end the chat, not just the match row.
   *  Removing both members makes the channel unreachable while keeping its
   *  history server-side for moderation review. Never throws. */
  async endMatchChannel(matchId: string, memberIds: string[]): Promise<void> {
    try {
      const channel = this.getClient().channel('messaging', `match-${matchId}`);
      await channel.removeMembers(memberIds);
    } catch (err) {
      this.log.warn(`endMatchChannel(${matchId}) failed: ${String(err)}`);
    }
  }

  /** HMAC check per Stream's webhook contract (X-Signature over the raw body).
   *  Returns the parsed event, or null when anything fails to verify. */
  verifyWebhook(rawBody: Buffer | undefined, signature: string | undefined): any | null {
    if (!rawBody || !signature) return null;
    const secret = this.config.get<string>('STREAM_API_SECRET');
    if (!secret) return null;
    try {
      const { verifyAndParseWebhook } = require('stream-chat');
      return verifyAndParseWebhook(rawBody, signature, secret);
    } catch {
      return null;
    }
  }
}
