import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD, APP_FILTER } from '@nestjs/core';

import { DbModule } from './db/db.module';
import { UsersModule } from './users/users.module';
import { ProfileController } from './profile/profile.controller';
import { ProfileService } from './profile/profile.service';
import { VerificationController } from './verification/verification.controller';
import { VerificationService } from './verification/verification.service';
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
import { AccountController } from './account/account.controller';
import { validateConfig } from './config/validation';
import { REDIS_THROTTLER_STORAGE } from './auth/redis-throttler-storage';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateConfig,
    }),
    // Spec 2.1 — global baseline; auth, like and report routes tighten it locally
    // with @Throttle.
    ThrottlerModule.forRootAsync({
      useFactory: (redisStorage: any) => ({
        throttlers: [
          { name: 'default', ttl: 60_000, limit: 100 },
        ],
        // Key by user ID when authenticated, otherwise by IP
        getTracker: throttlerKeyGenerator,
        // Use Redis storage when REDIS_URL is configured
        ...(redisStorage ? { storage: redisStorage } : {}),
      }),
      inject: [REDIS_THROTTLER_STORAGE],
    }),
    DbModule,
    UsersModule,
    NotificationsModule,
    AuthModule,
    PgBossModule,
    PhotosModule,
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
