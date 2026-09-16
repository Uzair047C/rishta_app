"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SubscriptionController = void 0;
const common_1 = require("@nestjs/common");
const auth_1 = require("../auth/auth");
const users_service_1 = require("../users/users.service");
const subscription_service_1 = require("./subscription.service");
let SubscriptionController = class SubscriptionController {
    subscriptions;
    users;
    constructor(subscriptions, users) {
        this.subscriptions = subscriptions;
        this.users = users;
    }
    async status(principal) {
        const user = await this.users.require(principal.uid);
        return this.subscriptions.status(user.id);
    }
    /**
     * @Public because the caller is RevenueCat, not a signed-in user — the shared
     * secret checked in applyWebhook is what authenticates it.
     *
     * The body is a plain interface rather than a DTO class on purpose: the global
     * ValidationPipe runs with whitelist:true, which would strip every property of
     * a class carrying no validation decorators, leaving an empty event. The two
     * fields that matter are checked explicitly below instead.
     */
    async webhook(body, authorization) {
        const event = body?.event;
        if (!event || typeof event.type !== 'string' || typeof event.app_user_id !== 'string') {
            throw new common_1.BadRequestException('malformed_webhook_event');
        }
        return this.subscriptions.applyWebhook(event, authorization);
    }
};
exports.SubscriptionController = SubscriptionController;
__decorate([
    (0, common_1.Get)('status'),
    __param(0, (0, auth_1.Auth)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], SubscriptionController.prototype, "status", null);
__decorate([
    (0, auth_1.Public)(),
    (0, common_1.Post)('webhook'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Headers)('authorization')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], SubscriptionController.prototype, "webhook", null);
exports.SubscriptionController = SubscriptionController = __decorate([
    (0, common_1.Controller)('subscription'),
    __metadata("design:paramtypes", [subscription_service_1.SubscriptionService,
        users_service_1.UsersService])
], SubscriptionController);
//# sourceMappingURL=subscription.controller.js.map