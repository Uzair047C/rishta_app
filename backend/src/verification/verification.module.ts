import { Module, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { UsersModule } from '../users/users.module';
import { VerificationService } from './verification.service';
import { VerificationController } from './verification.controller';
import { faceVerificationProviderFactory, FACE_VERIFICATION_PROVIDER } from './face-verification.provider';

@Global()
@Module({
  imports: [ConfigModule, UsersModule],
  controllers: [VerificationController],
  providers: [
    VerificationService,
    { provide: FACE_VERIFICATION_PROVIDER, useFactory: faceVerificationProviderFactory, inject: [ConfigService] },
  ],
  exports: [VerificationService, FACE_VERIFICATION_PROVIDER],
})
export class VerificationModule {}