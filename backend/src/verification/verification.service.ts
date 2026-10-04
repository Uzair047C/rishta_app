import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Db } from '../db/db';
import { ProfileRow, UserRow, VerificationEventRow, VerificationStatus } from '../db/types';

export interface VerificationStatusView {
  status: VerificationStatus;
  reason: string | null;
  updatedAt: Date | null;
}

@Injectable()
export class VerificationService {
  private readonly log = new Logger(VerificationService.name);

  constructor(private readonly db: Db) {}

  /**
   * Creates a mock liveness session for development.
   * In production with Firebase/AWS removed, we simulate successful verification.
   */
  async createLivenessSession(): Promise<{ sessionId: string | null; devBypass: boolean }> {
    // Return a mock session ID - in real implementation this would come from AWS
    return { sessionId: `mock-session-${Date.now()}`, devBypass: true };
  }

  /**
   * Spec 1.2/2.3 — submits a live selfie for verification.
   * With Firebase/AWS removed, we simulate successful verification for development.
   * In a real implementation without Firebase, you'd integrate with another provider
   * or implement local verification logic.
   */
  async submit(user: UserRow, livenessSessionId?: string, selfieUrl?: string): Promise<VerificationStatusView> {
    const profile = await this.db.one<ProfileRow>('SELECT * FROM profiles WHERE user_id = $1', [user.id]);
    const primaryPhoto = profile?.photos?.[0];
    if (!primaryPhoto) throw new BadRequestException('no_primary_photo');

    // Simulate successful verification for development
    // In production without Firebase/AWS, you would implement actual verification logic here
    this.log.debug('Verification service: Simulating successful verification (Firebase/AWS removed)');
    return this.record(
      user.id,
      selfieUrl ?? `mock-selfie://${Date.now()}`,
      95, // mock match score
      90, // mock liveness score
      'verified',
      null,
    );
  }

  /**
   * Spec 2.3 — re-opens verification after a primary-photo change.
   * The profiles.verification_status reset itself is enforced by a DB trigger;
   * this adds the audit row and is what the enqueue would hand to a worker.
   */
  reopen(userId: string, reason: string) {
    return this.record(userId, 'pending://reverification', null, null, 'pending', reason);
  }

  async status(userId: string): Promise<VerificationStatusView> {
    const latest = await this.db.one<VerificationEventRow>(
      'SELECT * FROM verification_events WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
      [userId],
    );
    return {
      status: latest?.result ?? 'pending',
      reason: latest?.reason ?? null,
      updatedAt: latest?.created_at ?? null,
    };
  }

  /** Records the attempt and moves profiles.verification_status to match. */
  private async record(
    userId: string,
    selfieUrl: string,
    matchScore: number | null,
    livenessScore: number | null,
    result: VerificationStatus,
    reason: string | null,
  ): Promise<VerificationStatusView> {
    await this.db.tx(async (conn) => {
      await conn.query(
        `INSERT INTO verification_events (user_id, selfie_url, match_score, liveness_score, result, reason)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [userId, selfieUrl, matchScore, livenessScore, result, reason],
      );
      // Direct write, not via Repo: the trigger on profiles only reacts to photo
      // changes, so a plain status update here passes through untouched.
      await conn.query('UPDATE profiles SET verification_status = $2 WHERE user_id = $1', [
        userId,
        result,
      ]);
    });
    return { status: result, reason, updatedAt: new Date() };
  }
}
