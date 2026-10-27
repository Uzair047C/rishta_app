import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CompareFacesCommand, CompareFacesCommandOutput, DetectFacesCommand, DetectFacesCommandOutput, RekognitionClient } from '@aws-sdk/client-rekognition';

/** Result of a face verification attempt. */
export interface VerificationResult {
  verified: boolean;
  matchScore: number | null;
  livenessScore: number | null;
  reason: string | null;
}

/** Interface for face verification providers. */
export interface FaceVerificationProvider {
  /**
   * Verify a live selfie against the user's primary profile photo.
   * @param primaryPhotoUrl - URL of the user's primary profile photo (stored in our bucket)
   * @param selfieUrl - URL of the live selfie to verify
   * @returns VerificationResult with match/liveness scores
   */
  verify(primaryPhotoUrl: string, selfieUrl: string): Promise<VerificationResult>;
}

/** AWS Rekognition implementation of FaceVerificationProvider. */
@Injectable()
export class AwsRekognitionProvider implements FaceVerificationProvider {
  private readonly client: RekognitionClient;
  private readonly similarityThreshold: number;

  constructor(config: ConfigService) {
    const region = config.get<string>('AWS_REGION') ?? 'us-east-1';
    const accessKeyId = config.get<string>('AWS_ACCESS_KEY_ID');
    const secretAccessKey = config.get<string>('AWS_SECRET_ACCESS_KEY');

    this.client = new RekognitionClient({
      region,
      credentials: accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : undefined,
    });
    this.similarityThreshold = Number(config.get<string>('REKOGNITION_SIMILARITY_THRESHOLD') ?? 80);
  }

  async verify(primaryPhotoUrl: string, selfieUrl: string): Promise<VerificationResult> {
    // For Rekognition CompareFaces, we need the images as base64 or S3 objects.
    // Since we store URLs in our bucket, we'll fetch them and send as bytes.
    // Note: In production, use S3 object references directly for better performance.

    try {
      // Step 1: Compare faces
      const compareResult = await this.compareFaces(primaryPhotoUrl, selfieUrl);

      // Step 2: Check liveness on the selfie
      const livenessResult = await this.checkLiveness(selfieUrl);

      const faceMatches = compareResult.FaceMatches ?? [];
      const bestMatch = faceMatches[0];
      const matchScore = bestMatch?.Similarity ?? 0;
      const livenessScore = livenessResult;

      const verified = matchScore >= this.similarityThreshold && livenessScore !== null && livenessScore > 50;

      return {
        verified,
        matchScore: matchScore > 0 ? matchScore : null,
        livenessScore,
        reason: verified ? null :
          matchScore < this.similarityThreshold ? 'face_match_below_threshold' : 'liveness_check_failed',
      };
    } catch (error) {
      // On any error, fail closed - return unverified
      return {
        verified: false,
        matchScore: null,
        livenessScore: null,
        reason: `verification_error: ${error instanceof Error ? error.message : 'unknown'}`,
      };
    }
  }

  private async compareFaces(sourceUrl: string, targetUrl: string): Promise<CompareFacesCommandOutput> {
    // Fetch both images and convert to base64
    const [sourceBytes, targetBytes] = await Promise.all([
      this.fetchImageAsBase64(sourceUrl),
      this.fetchImageAsBase64(targetUrl),
    ]);

    const command = new CompareFacesCommand({
      SourceImage: { Bytes: sourceBytes },
      TargetImage: { Bytes: targetBytes },
      SimilarityThreshold: this.similarityThreshold,
    });

    return this.client.send(command);
  }

  private async checkLiveness(photoUrl: string): Promise<number | null> {
    try {
      const bytes = await this.fetchImageAsBase64(photoUrl);
      const command = new DetectFacesCommand({
        Image: { Bytes: bytes },
        Attributes: ['ALL'],
      });

      const result = await this.client.send(command);
      const faces = result.FaceDetails ?? [];

      if (faces.length === 0) return null;

      // Rekognition doesn't have a direct "liveness" score in DetectFaces
      // Use confidence of face detection as a proxy, and check for eyes open, etc.
      const face = faces[0];
      let livenessScore = face.Confidence ?? 0;

      // Boost score if eyes are open (indicates live person)
      if (face.EyesOpen?.Value === true && (face.EyesOpen?.Confidence ?? 0) > 90) {
        livenessScore = Math.min(100, livenessScore + 10);
      }

      // Check for smile/pose variations that suggest live capture
      if (face.Smile?.Value === true && (face.Smile?.Confidence ?? 0) > 70) {
        livenessScore = Math.min(100, livenessScore + 5);
      }

      return Math.round(livenessScore);
    } catch {
      return null;
    }
  }

  private async fetchImageAsBase64(url: string): Promise<Uint8Array> {
    // Only allow URLs from our storage bucket for SSRF protection
    const allowedHost = process.env.STORAGE_BUCKET_HOST ?? 'storage.example.com';
    const urlObj = new URL(url);

    if (urlObj.host !== allowedHost && !urlObj.host.endsWith(`.${allowedHost}`)) {
      throw new Error(`Image URL host not allowed: ${urlObj.host}`);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        redirect: 'manual', // Don't follow redirects
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status}`);
      }

      // Check content length
      const contentLength = response.headers.get('content-length');
      if (contentLength && parseInt(contentLength, 10) > 5 * 1024 * 1024) {
        throw new Error('Image exceeds 5MB limit');
      }

      const arrayBuffer = await response.arrayBuffer();
      return new Uint8Array(arrayBuffer);
    } finally {
      clearTimeout(timeout);
    }
  }
}

/** No-op provider for when no verification provider is configured.
 * Fails closed - returns unverified and queues for human review. */
@Injectable()
export class NoOpVerificationProvider implements FaceVerificationProvider {
  async verify(primaryPhotoUrl: string, selfieUrl: string): Promise<VerificationResult> {
    return {
      verified: false,
      matchScore: null,
      livenessScore: null,
      reason: 'no_provider_configured',
    };
  }
}

/** Admin verification actions. */
export interface AdminVerificationAction {
  userId: string;
  reviewedBy: string;
  action: 'approve' | 'reject';
  reason?: string;
}

/** Provider token for DI. */
export const FACE_VERIFICATION_PROVIDER = 'FACE_VERIFICATION_PROVIDER';

/** Factory to provide the correct verification provider based on config. */
export const faceVerificationProviderFactory = (config: ConfigService): FaceVerificationProvider => {
  const provider = config.get<string>('FACE_VERIFICATION_PROVIDER') ?? 'none';

  if (provider === 'aws-rekognition') {
    return new AwsRekognitionProvider(config);
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('FACE_VERIFICATION_PROVIDER must be configured in production');
  }

  return new NoOpVerificationProvider();
};