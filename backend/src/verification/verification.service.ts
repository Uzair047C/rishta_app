import { BadRequestException, Injectable, Logger, Inject } from '@nestjs/common';
import { Db } from '../db/db';
import { ProfileRow, UserRow, VerificationEventRow, VerificationStatus } from '../db/types';
import { FaceVerificationProvider, VerificationResult, FACE_VERIFICATION_PROVIDER } from './face-verification.provider';

export interface VerificationStatusView {
  status: VerificationStatus;
  reason: string | null;
  updatedAt: Date | null;
}

@Injectable()
export class VerificationService {
  private readonly log = new Logger(VerificationService.name);

  constructor(
    private readonly db: Db,
    @Inject(FACE_VERIFICATION_PROVIDER) private readonly provider: FaceVerificationProvider,
  ) {}

  
  /**
   * Spec 1.2/2.3 — submits a live selfie for verification.
   * Uses the configured FaceVerificationProvider (AWS Rekognition or none).
   * With no provider configured, fails closed and queues for human review.
   * Never auto-approves — all verifications require admin review.
   */
  async submit(user: UserRow, livenessSessionId?: string, selfieUrl?: string): Promise<VerificationStatusView> {
    const profile = await this.db.one<ProfileRow>('SELECT * FROM profiles WHERE user_id = $1', [user.id]);
    const primaryPhoto = profile?.photos?.[0];
    if (!primaryPhoto) throw new BadRequestException('no_primary_photo');

    // Verify using the configured provider
    const result = await this.provider.verify(primaryPhoto, selfieUrl ?? '');

    // Always set to pending — admin must explicitly approve/reject
    const status: VerificationStatus = 'pending';
    const reason = result.verified
      ? `provider_verified: match=${result.matchScore}, liveness=${result.livenessScore}`
      : result.reason ?? 'provider_failed';

    return this.record(
      user.id,
      selfieUrl ?? `selfie://${livenessSessionId ?? Date.now()}`,
      result.matchScore,
      result.livenessScore,
      status,
      reason,
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

  /** Admin: approve a pending verification. */
  async approve(userId: string, reviewedBy: string): Promise<VerificationStatusView> {
    const latest = await this.db.one<VerificationEventRow>(
      'SELECT * FROM verification_events WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
      [userId],
    );
    if (!latest || latest.result !== 'pending') {
      throw new BadRequestException('no_pending_verification');
    }

    return this.record(
      userId,
      latest.selfie_url,
      latest.match_score,
      latest.liveness_score,
      'verified',
      `approved_by_${reviewedBy}`,
    );
  }

  /** Admin: reject a pending verification. */
  async reject(userId: string, reviewedBy: string, reason: string): Promise<VerificationStatusView> {
    const latest = await this.db.one<VerificationEventRow>(
      'SELECT * FROM verification_events WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
      [userId],
    );
    if (!latest || latest.result !== 'pending') {
      throw new BadRequestException('no_pending_verification');
    }

    return this.record(
      userId,
      latest.selfie_url,
      latest.match_score,
      latest.liveness_score,
      'failed',
      `rejected_by_${reviewedBy}: ${reason}`,
    );
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
        `INSERT INTO verification_events (user_id, selfie_url, match_score, liveness_score, result, reason, reviewed_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [userId, selfieUrl, matchScore, livenessScore, result, reason, result === 'verified' || result === 'failed' ? null : null],
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