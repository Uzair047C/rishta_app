import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD, APP_FILTER } from '@nestjs/core';

import { DbModule } from './db/db.module';
import { UsersModule } from './users/users.module';
import { ProfileController } from './profile/profile.controller';
import { ProfileService } from './profile/profile.service';
import { VerificationController } from './verification/verification.controller';
import { VerificationService } from './verification/verification.service';
import { FACE_VERIFICATION_PROVIDER, faceVerificationProviderFactory } from './verification/face-verification.provider';
import { FeedController } from './feed/feed.controller';
import { FeedService } from './feed/feed.service';
import { MatchesController } from './matches/matches.controller';
import { ReportsController } from './reports/reports.controller';
import { SubscriptionController } from './subscription/subscription.controller';
import { SubscriptionService } from './subscription/subscription.service';
import { NotificationsController } from './notifications/notifications.controller';
import { NotificationsModule } from './notifications/notifications.module';
import { ModerationService } from './moderation/moderation.service';
import { AdminController, AdminGuard } from './moderation/admin.controller';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { PostgresExceptionFilter } from './common/postgres-exception.filter';
import { throttlerKeyGenerator } from './auth/throttler-options';
import { PhotosModule } from './photos/photos.module';
import { PgBossModule } from './pg-boss/pg-boss.module';
import { ChatModule } from './chat/chat.module';
import { AccountController } from './account/account.controller';
import { validateConfig } from './config/validation';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateConfig,
    }),
    // Spec 2.1 — global baseline; auth, like and report routes tighten it locally
    // with @Throttle.
    ThrottlerModule.forRootAsync({
      useFactory: (config: ConfigService) => ({
        throttlers: [
          { name: 'default', ttl: 60_000, limit: 100 },
        ],
        // Key by user ID when authenticated, otherwise by IP
        getTracker: throttlerKeyGenerator,
        // ponytail: Redis throttler storage was wired to an unregistered token and
        // never worked; in-memory until Redis throttling is actually needed.
      }),
      inject: [ConfigService],
    }),
    DbModule,
    UsersModule,
    NotificationsModule,
    AuthModule,
    PgBossModule,
    PhotosModule,
    ChatModule,
  ],
  controllers: [
    ProfileController,
    VerificationController,
    FeedController,
    MatchesController,
    ReportsController,
    SubscriptionController,
    NotificationsController,
    AdminController,
    AccountController,
  ],
  providers: [
    ProfileService,
    VerificationService,
    { provide: FACE_VERIFICATION_PROVIDER, useFactory: faceVerificationProviderFactory, inject: [ConfigService] },
    FeedService,
    SubscriptionService,
    ModerationService,
    AdminGuard,
    // Order matters: throttle before token verification, so an unauthenticated
    // flood is rejected by the cheaper check.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_FILTER, useClass: PostgresExceptionFilter },
  ],
})
export class AppModule {}
