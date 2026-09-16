import { Injectable, Logger } from '@nestjs/common';
import { Db } from '../db/db';

type Source = 'bio' | 'photo' | 'message';

export interface ScreenResult {
  flagged: boolean;
  labels: string[];
  score: number;
}

const CLEAN: ScreenResult = { flagged: false, labels: [], score: 0 };

/** ponytail: 5 MB ceiling — Rekognition's inline-bytes limit. Switch to an
 *  S3Object reference if users ever upload originals that large. */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/**
 * Spec 2.5 — flags content for human review, does not hard-block on first pass.
 * Both providers degrade to passthrough when unconfigured, so the pipeline is
 * exercisable in development without cloud credentials; the flag row is still
 * written either way, which is what the review queue reads.
 */
@Injectable()
export class ModerationService {
  private readonly log = new Logger(ModerationService.name);

  constructor(private readonly db: Db) {}

  async screenText(text: string, userId: string, source: Source, refId?: string): Promise<ScreenResult> {
    const key = process.env.OPENAI_API_KEY;
    if (!key || !text.trim()) return CLEAN;

    try {
      const res = await fetch('https://api.openai.com/v1/moderations', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
        body: JSON.stringify({ input: text, model: 'omni-moderation-latest' }),
      });
      if (!res.ok) throw new Error(`openai ${res.status}`);

      const body = (await res.json()) as {
        results: { flagged: boolean; category_scores: Record<string, number> }[];
      };
      const top = body.results[0];
      const labels = Object.entries(top.category_scores)
        .filter(([, v]) => v > 0.5)
        .map(([k]) => k);

      if (top.flagged) await this.flag(userId, source, refId, text, labels, Math.max(...Object.values(top.category_scores)));
      return { flagged: top.flagged, labels, score: Math.max(0, ...Object.values(top.category_scores)) };
    } catch (err) {
      // Fail open, but loudly: a moderation outage must not take down posting.
      this.log.warn(`text moderation unavailable (${String(err)}); content not screened`);
      return CLEAN;
    }
  }

  async screenImage(userId: string, imageUrl: string, refId?: string): Promise<ScreenResult> {
    if (!process.env.AWS_ACCESS_KEY_ID) return CLEAN;

    try {
      const image = await fetch(imageUrl);
      if (!image.ok) throw new Error(`fetch ${image.status}`);
      const bytes = new Uint8Array(await image.arrayBuffer());
      if (bytes.byteLength > MAX_IMAGE_BYTES) {
        this.log.warn(`image ${refId ?? ''} exceeds ${MAX_IMAGE_BYTES}B; not screened`);
        return CLEAN;
      }

      const { RekognitionClient, DetectModerationLabelsCommand } = await import(
        '@aws-sdk/client-rekognition'
      );
      const client = new RekognitionClient({ region: process.env.AWS_REGION });
      const out = await client.send(
        new DetectModerationLabelsCommand({ Image: { Bytes: bytes }, MinConfidence: 60 }),
      );
      const labels = (out.ModerationLabels ?? []).map((l) => l.Name ?? 'unknown');
      const score = Math.max(0, ...(out.ModerationLabels ?? []).map((l) => l.Confidence ?? 0));

      if (labels.length) await this.flag(userId, 'photo', refId, imageUrl, labels, score);
      return { flagged: labels.length > 0, labels, score };
    } catch (err) {
      this.log.warn(`image moderation unavailable (${String(err)}); content not screened`);
      return CLEAN;
    }
  }

  private flag(
    userId: string,
    source: Source,
    refId: string | undefined,
    content: string | null,
    labels: string[],
    score: number,
  ) {
    return this.db.query(
      `INSERT INTO moderation_flags (user_id, source, ref_id, content, labels, score)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
      [userId, source, refId ?? null, content, JSON.stringify(labels), score],
    );
  }
}
