import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PhotosService } from './photos.service';
import { PhotoModerationWorker } from './photo-moderation.worker';
import { PgBossModule } from '../pg-boss/pg-boss.module';
import { ModerationService } from '../moderation/moderation.service';
import { VerificationService } from '../verification/verification.service';
import { FACE_VERIFICATION_PROVIDER, faceVerificationProviderFactory } from '../verification/face-verification.provider';

@Module({
  imports: [PgBossModule],
  providers: [
    PhotosService,
    PhotoModerationWorker,
    ModerationService,
    VerificationService,
    { provide: FACE_VERIFICATION_PROVIDER, useFactory: faceVerificationProviderFactory, inject: [ConfigService] },
  ],
  exports: [PhotosService],
})
export class PhotosModule {}