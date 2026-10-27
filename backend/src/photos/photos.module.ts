import { Module } from '@nestjs/common';
import { PhotosService } from './photos.service';
import { PhotoModerationWorker } from './photo-moderation.worker';
import { PgBossModule } from '../pg-boss/pg-boss.module';
import { ModerationService } from '../moderation/moderation.service';
import { VerificationService } from '../verification/verification.service';

@Module({
  imports: [PgBossModule],
  providers: [PhotosService, PhotoModerationWorker, ModerationService, VerificationService],
  exports: [PhotosService],
})
export class PhotosModule {}