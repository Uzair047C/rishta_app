import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { Db } from '../db/db';
import { ProfileRow, UserRow, VerificationEventRow, VerificationStatus } from '../db/types';

/** Rekognition's default CompareFaces similarity floor. */
const FACE_MATCH_THRESHOLD = Number(process.env.REKOGNITION_FACE_MATCH_THRESHOLD ?? 90);
/** CognitiveServices Face Liveness confidence floor. */
const LIVENESS_THRESHOLD = 80;

export interface VerificationStatusView {
  status: VerificationStatus;
  reason: string | null;
  updatedAt: Date | null;
}

@Injectable()
export class VerificationService {
  private readonly log = new Logger(VerificationService.name);

  constructor(private readonly db: Db) {}

  /** True when the deployment cannot actually verify anyone. */
  private get awsConfigured(): boolean {
    return Boolean(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_ACCESS_KEY_ID.length > 0);
  }

  /**
   * Refuses rather than silently auto-approving. A dev-only passthrough exists
   * so the flow is testable locally, but it is gated on NODE_ENV and logs a
   * warning on every use — an unconfigured provider must never pass silently.
   */
  private assertProvider(): boolean {
    if (this.awsConfigured) return true;
    if (process.env.NODE_ENV === 'production') {
      throw new ServiceUnavailableException('verification_provider_not_configured');
    }
    this.log.warn('AWS not configured — auto-approving verification. DEVELOPMENT ONLY.');
    return false;
  }

  /** Creates a Rekognition Face Liveness session for the client SDK to record into. */
  async createLivenessSession(): Promise<{ sessionId: string | null; devBypass: boolean }> {
    if (!this.assertProvider()) return { sessionId: null, devBypass: true };
    const { RekognitionClient, CreateFaceLivenessSessionCommand } = await import(
      '@aws-sdk/client-rekognition'
    );
    const client = new RekognitionClient({ region: process.env.AWS_REGION });
    const out = await client.send(new CreateFaceLivenessSessionCommand({}));
    return { sessionId: out.SessionId ?? null, devBypass: false };
  }

  /**
   * Spec 1.2/2.3 — submits a live selfie for liveness + face match against the
   * primary profile photo. One row per attempt, including re-verifications.
   */
  async submit(user: UserRow, livenessSessionId?: string, selfieUrl?: string): Promise<VerificationStatusView> {
    const profile = await this.db.one<ProfileRow>('SELECT * FROM profiles WHERE user_id = $1', [user.id]);
    const primaryPhoto = profile?.photos?.[0];
    if (!primaryPhoto) throw new BadRequestException('no_primary_photo');

    if (!this.assertProvider()) return this.record(user.id, selfieUrl ?? 'dev://bypass', null, null, 'verified', 'dev_bypass');

    try {
      const { RekognitionClient, GetFaceLivenessSessionResultsCommand, CompareFacesCommand } =
        await import('@aws-sdk/client-rekognition');
      const client = new RekognitionClient({ region: process.env.AWS_REGION });

      if (!livenessSessionId) throw new BadRequestException('liveness_session_required');
      const liveness = await client.send(
        new GetFaceLivenessSessionResultsCommand({ SessionId: livenessSessionId }),
      );
      const livenessScore = liveness.Confidence ?? 0;
      if (liveness.Status !== 'SUCCEEDED' || livenessScore < LIVENESS_THRESHOLD) {
        return this.record(user.id, `liveness://${livenessSessionId}`, null, livenessScore, 'failed', 'liveness_failed');
      }

      const reference = liveness.ReferenceImage?.Bytes;
      if (!reference) return this.record(user.id, `liveness://${livenessSessionId}`, null, livenessScore, 'failed', 'no_reference_image');

      const target = await fetch(primaryPhoto);
      if (!target.ok) throw new BadRequestException('primary_photo_unreachable');
      const targetBytes = new Uint8Array(await target.arrayBuffer());

      const compared = await client.send(
        new CompareFacesCommand({
          SourceImage: { Bytes: reference },
          TargetImage: { Bytes: targetBytes },
          SimilarityThreshold: FACE_MATCH_THRESHOLD,
        }),
      );
      const matchScore = compared.FaceMatches?.[0]?.Similarity ?? 0;
      const passed = matchScore >= FACE_MATCH_THRESHOLD;

      return this.record(
        user.id,
        `liveness://${livenessSessionId}`,
        matchScore,
        livenessScore,
        passed ? 'verified' : 'failed',
        passed ? null : 'face_mismatch',
      );
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      this.log.error(`verification failed: ${String(err)}`);
      return this.record(user.id, `liveness://${livenessSessionId}`, null, null, 'failed', 'provider_error');
    }
  }

  /**
   * Spec 2.3 — re-opens verification after a primary-photo change. The
   * profiles.verification_status reset itself is enforced by a DB trigger;
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
