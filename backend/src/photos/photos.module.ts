import { Module } from '@nestjs/common';
import { PhotosService } from './photos.service';
import { PhotoModerationWorker } from './photo-moderation.worker';
import { PgBossModule } from '../pg-boss/pg-boss.module';
import { ModerationService } from '../moderation/moderation.service';
import { VerificationModule } from '../verification/verification.module';

@Module({
  imports: [PgBossModule, VerificationModule],
  providers: [PhotosService, PhotoModerationWorker, ModerationService],
  exports: [PhotosService],
})
export class PhotosModule {}