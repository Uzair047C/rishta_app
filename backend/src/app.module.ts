import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD, APP_FILTER } from '@nestjs/core';

import { Db } from './db/db';
import { UsersService } from './users/users.service';
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
import { PushService } from './notifications/push.service';
import { ModerationService } from './moderation/moderation.service';
import { AdminController, AdminGuard } from './moderation/admin.controller';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { PostgresExceptionFilter } from './common/postgres-exception.filter';
import { throttlerKeyGenerator } from './auth/throttler-options';
import { PhotosModule } from './photos/photos.module';
import { PgBossModule } from './pg-boss/pg-boss.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    // Spec 2.1 — global baseline; auth, like and report routes tighten it locally
    // with @Throttle.
    ThrottlerModule.forRoot({
      throttlers: [
        { name: 'default', ttl: 60_000, limit: 100 },
      ],
      // Key by user ID when authenticated, otherwise by IP
      getTracker: throttlerKeyGenerator,
    }),
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
  ],
  providers: [
    Db,
    UsersService,
    ProfileService,
    VerificationService,
    FeedService,
    PushService,
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
