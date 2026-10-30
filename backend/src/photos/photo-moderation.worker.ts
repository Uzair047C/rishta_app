import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PgBossService } from '../pg-boss/pg-boss.service';
import { PhotosService } from './photos.service';
import { ModerationService } from '../moderation/moderation.service';

interface ModeratePhotoJob {
  userId: string;
  objectPath: string;
  position: number;
  [key: string]: unknown;
}

@Injectable()
export class PhotoModerationWorker implements OnModuleInit {
  private readonly log = new Logger(PhotoModerationWorker.name);

  constructor(
    private readonly pgBoss: PgBossService,
    private readonly photos: PhotosService,
    private readonly moderation: ModerationService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.pgBoss.subscribe<ModeratePhotoJob>(
      'moderate-photo',
      async (jobs: { id: string; name: string; data: ModeratePhotoJob }[]) => {
        for (const job of jobs) {
          await this.handleModeration(job.data);
        }
      },
      { teamSize: 2, teamConcurrency: 1 },
    );
  }

  private async handleModeration(data: ModeratePhotoJob): Promise<void> {
    const { userId, objectPath } = data;
    const storageUrl = this.photos.getStorageUrl(objectPath);

    this.log.log(`Moderating photo: userId=${userId}, path=${objectPath}`);

    try {
      // Screen the image with SSRF protection
      const result = await this.moderation.screenImage(userId, storageUrl, objectPath);

      // Handle result
      await this.photos.handleModerationResult(userId, objectPath, result.flagged, result.labels);

      if (result.flagged) {
        this.log.warn(`Photo flagged: userId=${userId}, path=${objectPath}, labels=${result.labels.join(', ')}`);
      } else {
        this.log.log(`Photo clean: userId=${userId}, path=${objectPath}`);
      }
    } catch (error) {
      this.log.error(`Photo moderation failed: userId=${userId}, path=${objectPath}`, error);
      // On moderation failure, treat as flagged (fail closed)
      await this.photos.handleModerationResult(userId, objectPath, true, ['moderation_error']);
    }
  }
}