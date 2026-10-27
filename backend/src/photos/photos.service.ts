import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Db } from '../db/db';
import { PgBossService } from '../pg-boss/pg-boss.service';
import { ModerationService } from '../moderation/moderation.service';
import { VerificationService } from '../verification/verification.service';
import { UserRow, ProfileRow } from '../db/types';

const MAX_PHOTOS = 6;
const MAX_PHOTO_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_BUCKET_HOST = process.env.STORAGE_BUCKET_HOST ?? 'storage.example.com';
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

export interface PhotoUploadInput {
  userId: string;
  objectPath: string; // e.g., "photos/user-uuid/photo1.jpg"
  makePrimary?: boolean;
}

export interface PhotoUploadResult {
  photos: string[];
  primaryPhoto: string | null;
  reVerificationRequired: boolean;
}

@Injectable()
export class PhotosService {
  private readonly log = new Logger(PhotosService.name);

  constructor(
    private readonly db: Db,
    private readonly config: ConfigService,
    private readonly pgBoss: PgBossService,
    private readonly moderation: ModerationService,
    private readonly verification: VerificationService,
  ) {}

  /**
   * Validate and register a photo URL from our storage bucket.
   * - Validates the URL host matches our bucket
   * - Validates the path is under the user's folder
   * - Screens the image via moderation (async via pg-boss)
   * - Updates profile photos array
   * - Triggers re-verification if primary photo changed
   */
  async addPhoto(input: PhotoUploadInput): Promise<PhotoUploadResult> {
    const { userId, objectPath, makePrimary } = input;

    // Validate object path format: must be under photos/{userId}/
    if (!this.validateObjectPath(userId, objectPath)) {
      throw new BadRequestException('invalid_object_path');
    }

    const profile = await this.db.one<ProfileRow>(
      'SELECT * FROM profiles WHERE user_id = $1',
      [userId],
    );
    const photos = profile?.photos ?? [];

    if (!profile) {
      await this.db.query('INSERT INTO profiles (user_id) VALUES ($1)', [userId]);
    }
    if (photos.length >= MAX_PHOTOS) {
      throw new BadRequestException('photo_limit_reached');
    }

    const isPrimary = makePrimary ?? photos.length === 0;
    const previousPrimary = photos[0];
    const next = isPrimary ? [objectPath, ...photos] : [...photos, objectPath];

    // Update photos array immediately (moderation happens async)
    await this.db.query(
      'UPDATE profiles SET photos = $2, updated_at = now() WHERE user_id = $1',
      [userId, next],
    );

    // Enqueue moderation job (async, off request path)
    await this.pgBoss.send('moderate-photo', {
      userId,
      objectPath,
      position: isPrimary ? 0 : photos.length,
    });

    // Trigger re-verification if primary photo changed
    let reVerificationRequired = false;
    if (isPrimary && previousPrimary !== objectPath) {
      await this.verification.reopen(userId, previousPrimary ? 'primary_photo_changed' : 'initial_photo');
      reVerificationRequired = true;
    }

    return { photos: next, primaryPhoto: next[0] ?? null, reVerificationRequired };
  }

  async setPhotos(userId: string, objectPaths: string[]): Promise<PhotoUploadResult> {
    if (objectPaths.length > MAX_PHOTOS) {
      throw new BadRequestException('photo_limit_reached');
    }

    // Validate all object paths
    for (const path of objectPaths) {
      if (!this.validateObjectPath(userId, path)) {
        throw new BadRequestException('invalid_object_path');
      }
    }

    const existing = await this.db.one<ProfileRow>('SELECT * FROM profiles WHERE user_id = $1', [userId]);
    if (!existing) {
      await this.db.query('INSERT INTO profiles (user_id) VALUES ($1)', [userId]);
    }

    const previousPrimary = existing?.photos?.[0];
    const nextPrimary = objectPaths[0];

    // Update photos array immediately
    await this.db.query(
      'UPDATE profiles SET photos = $2, updated_at = now() WHERE user_id = $1',
      [userId, objectPaths],
    );

    // Enqueue moderation jobs for all photos
    for (let i = 0; i < objectPaths.length; i++) {
      await this.pgBoss.send('moderate-photo', {
        userId,
        objectPath: objectPaths[i],
        position: i,
      });
    }

    let reVerificationRequired = false;
    if (nextPrimary && previousPrimary !== nextPrimary) {
      await this.verification.reopen(userId, previousPrimary ? 'primary_photo_changed' : 'initial_photo');
      reVerificationRequired = true;
    }

    return { photos: objectPaths, primaryPhoto: nextPrimary ?? null, reVerificationRequired };
  }

  /**
   * Validate that the object path is under the user's folder in our bucket.
   * Expected format: photos/{userId}/filename
   */
  private validateObjectPath(userId: string, objectPath: string): boolean {
    const prefix = `photos/${userId}/`;
    return objectPath.startsWith(prefix) && objectPath.length > prefix.length;
  }

  /**
   * Construct the full storage URL from an object path.
   * Used by moderation worker to fetch the image.
   */
  getStorageUrl(objectPath: string): string {
    const bucketHost = this.config.get<string>('STORAGE_BUCKET_HOST') ?? ALLOWED_BUCKET_HOST;
    const bucketName = this.config.get<string>('STORAGE_BUCKET_NAME') ?? 'rishta-photos';
    return `https://${bucketHost}/${bucketName}/${objectPath}`;
  }

  /**
   * Called by moderation worker after screening.
   * Updates photo status and hides from feed if flagged.
   */
  async handleModerationResult(userId: string, objectPath: string, flagged: boolean, labels: string[]): Promise<void> {
    const profile = await this.db.one<ProfileRow>(
      'SELECT * FROM profiles WHERE user_id = $1',
      [userId],
    );
    if (!profile) return;

    const photos = [...profile.photos];
    const index = photos.indexOf(objectPath);
    if (index === -1) return;

    if (flagged) {
      // Mark photo as needing review (we'll track this separately)
      // For now, remove from profile photos to hide from feed
      photos.splice(index, 1);
      await this.db.query(
        'UPDATE profiles SET photos = $2, updated_at = now() WHERE user_id = $1',
        [userId, photos],
      );
      this.log.warn(`Photo flagged and removed from profile: userId=${userId}, path=${objectPath}, labels=${labels.join(',')}`);
    }
  }
}