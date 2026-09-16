"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const schedule_1 = require("@nestjs/schedule");
const throttler_1 = require("@nestjs/throttler");
const core_1 = require("@nestjs/core");
const db_1 = require("./db/db");
const auth_1 = require("./auth/auth");
const auth_controller_1 = require("./auth/auth.controller");
const users_service_1 = require("./users/users.service");
const profile_controller_1 = require("./profile/profile.controller");
const profile_service_1 = require("./profile/profile.service");
const verification_controller_1 = require("./verification/verification.controller");
const verification_service_1 = require("./verification/verification.service");
const feed_controller_1 = require("./feed/feed.controller");
const feed_service_1 = require("./feed/feed.service");
const matches_controller_1 = require("./matches/matches.controller");
const reports_controller_1 = require("./reports/reports.controller");
const subscription_controller_1 = require("./subscription/subscription.controller");
const subscription_service_1 = require("./subscription/subscription.service");
const notifications_controller_1 = require("./notifications/notifications.controller");
const push_service_1 = require("./notifications/push.service");
const moderation_service_1 = require("./moderation/moderation.service");
const admin_controller_1 = require("./moderation/admin.controller");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({ isGlobal: true }),
            schedule_1.ScheduleModule.forRoot(),
            // Spec 2.1 — global baseline; auth, like and report routes tighten it locally
            // with @Throttle.
            throttler_1.ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 100 }]),
        ],
        controllers: [
            auth_controller_1.AuthController,
            profile_controller_1.ProfileController,
            verification_controller_1.VerificationController,
            feed_controller_1.FeedController,
            matches_controller_1.MatchesController,
            reports_controller_1.ReportsController,
            subscription_controller_1.SubscriptionController,
            notifications_controller_1.NotificationsController,
            admin_controller_1.AdminController,
        ],
        providers: [
            db_1.Db,
            users_service_1.UsersService,
            profile_service_1.ProfileService,
            verification_service_1.VerificationService,
            feed_service_1.FeedService,
            push_service_1.PushService,
            subscription_service_1.SubscriptionService,
            moderation_service_1.ModerationService,
            admin_controller_1.AdminGuard,
            // Order matters: throttle before token verification, so an unauthenticated
            // flood is rejected by the cheaper check.
            { provide: core_1.APP_GUARD, useClass: throttler_1.ThrottlerGuard },
            { provide: core_1.APP_GUARD, useClass: auth_1.FirebaseGuard },
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map