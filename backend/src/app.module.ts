import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

import { Db } from './db/db';
import { FirebaseGuard } from './auth/auth';
import { AuthController } from './auth/auth.controller';
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

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    // Spec 2.1 — global baseline; auth, like and report routes tighten it locally
    // with @Throttle.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 100 }]),
  ],
  controllers: [
    AuthController,
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
    { provide: APP_GUARD, useClass: FirebaseGuard },
  ],
})
export class AppModule {}
