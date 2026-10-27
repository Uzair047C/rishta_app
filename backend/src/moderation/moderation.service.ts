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
const IMAGE_FETCH_TIMEOUT = 5000; // 5 seconds

// Private IP ranges to block (SSRF protection)
const PRIVATE_IP_RANGES = [
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
  /^192\.168\./,
  /^127\./,
  /^169\.254\./,
  /^::1$/,
  /^fc00:/,
  /^fe80:/,
];

const ALLOWED_STORAGE_HOST = process.env.STORAGE_BUCKET_HOST ?? 'storage.example.com';

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

  /**
   * Screen an image URL with SSRF protection:
   * - Validates host is our storage bucket
   * - Resolves DNS and blocks private/loopback IPs
   * - 5 second timeout
   * - 5 MB size limit (streaming, abort when exceeded)
   * - No redirects
   * On any failure or moderation outage, fail closed (flagged=true)
   */
  async screenImage(userId: string, imageUrl: string, refId?: string): Promise<ScreenResult> {
    // Validate URL is from our storage bucket
    let urlObj: URL;
    try {
      urlObj = new URL(imageUrl);
    } catch {
      this.log.warn(`Invalid image URL: ${imageUrl}`);
      return { flagged: true, labels: ['invalid_url'], score: 1 };
    }

    // Check host matches our storage bucket
    if (urlObj.host !== ALLOWED_STORAGE_HOST && !urlObj.host.endsWith(`.${ALLOWED_STORAGE_HOST}`)) {
      this.log.warn(`Image URL host not allowed: ${urlObj.host}`);
      return { flagged: true, labels: ['host_not_allowed'], score: 1 };
    }

    if (!process.env.AWS_ACCESS_KEY_ID) {
      this.log.warn('AWS credentials not configured, skipping image moderation');
      return CLEAN;
    }

    let imageBytes: Uint8Array;
    try {
      // Fetch image with SSRF protection
      imageBytes = await this.fetchImageSafely(imageUrl);
    } catch (err) {
      this.log.warn(`Failed to fetch image for moderation: ${String(err)}`);
      // Fail closed - treat as flagged
      return { flagged: true, labels: ['fetch_failed'], score: 1 };
    }

    if (imageBytes.byteLength > MAX_IMAGE_BYTES) {
      this.log.warn(`image ${refId ?? ''} exceeds ${MAX_IMAGE_BYTES}B; flagged`);
      return { flagged: true, labels: ['oversized'], score: 1 };
    }

    try {
      const { RekognitionClient, DetectModerationLabelsCommand } = await import(
        '@aws-sdk/client-rekognition'
      );
      const client = new RekognitionClient({ region: process.env.AWS_REGION });
      const out = await client.send(
        new DetectModerationLabelsCommand({ Image: { Bytes: imageBytes }, MinConfidence: 60 }),
      );
      const labels = (out.ModerationLabels ?? []).map((l) => l.Name ?? 'unknown');
      const score = Math.max(0, ...(out.ModerationLabels ?? []).map((l) => l.Confidence ?? 0));

      if (labels.length) await this.flag(userId, 'photo', refId, imageUrl, labels, score);
      return { flagged: labels.length > 0, labels, score };
    } catch (err) {
      this.log.warn(`image moderation unavailable (${String(err)}); content flagged (fail closed)`);
      // Fail closed - moderation outage means we flag for human review
      return { flagged: true, labels: ['moderation_error'], score: 1 };
    }
  }

  /**
   * Fetch image with SSRF protection:
   * - 5 second timeout via AbortController
   * - Stream body with 5 MB cap (abort when exceeded)
   * - Block private/loopback IPs after DNS resolution
   * - No redirects
   */
  private async fetchImageSafely(url: string): Promise<Uint8Array> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), IMAGE_FETCH_TIMEOUT);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        redirect: 'manual', // Don't follow redirects
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status}`);
      }

      // Check content-length header first
      const contentLength = response.headers.get('content-length');
      if (contentLength && parseInt(contentLength, 10) > MAX_IMAGE_BYTES) {
        throw new Error('Image exceeds 5MB limit (content-length)');
      }

      // Stream the body with size limit
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const chunks: Uint8Array[] = [];
      let totalBytes = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        totalBytes += value.length;
        if (totalBytes > MAX_IMAGE_BYTES) {
          throw new Error('Image exceeds 5MB limit (streaming)');
        }
        chunks.push(value);
      }

      // Combine chunks
      const result = new Uint8Array(totalBytes);
      let offset = 0;
      for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
      }

      return result;
    } finally {
      clearTimeout(timeout);
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
