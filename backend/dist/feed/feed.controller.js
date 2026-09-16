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
exports.FeedController = void 0;
const common_1 = require("@nestjs/common");
const throttler_1 = require("@nestjs/throttler");
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
const auth_1 = require("../auth/auth");
const users_service_1 = require("../users/users.service");
const feed_service_1 = require("./feed.service");
class FeedQuery {
    minAge;
    maxAge;
    radiusKm;
    limit;
    offset;
}
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(18),
    (0, class_validator_1.Max)(120),
    __metadata("design:type", Number)
], FeedQuery.prototype, "minAge", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(18),
    (0, class_validator_1.Max)(120),
    __metadata("design:type", Number)
], FeedQuery.prototype, "maxAge", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(20000),
    __metadata("design:type", Number)
], FeedQuery.prototype, "radiusKm", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(50),
    __metadata("design:type", Number)
], FeedQuery.prototype, "limit", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], FeedQuery.prototype, "offset", void 0);
class TargetDto {
    userId;
}
__decorate([
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], TargetDto.prototype, "userId", void 0);
class BlockDto extends TargetDto {
    reason;
}
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(500),
    __metadata("design:type", String)
], BlockDto.prototype, "reason", void 0);
let FeedController = class FeedController {
    feed;
    users;
    constructor(feed, users) {
        this.feed = feed;
        this.users = users;
    }
    /** Only verified, onboarded profiles see a feed at all. */
    async list(principal, query) {
        const user = await this.users.requireOnboarded(principal.uid);
        return { candidates: await this.feed.feed(user, query) };
    }
    /** Stricter limit than the global default — this is a write with a quota. */
    async like(principal, dto) {
        const user = await this.users.requireOnboarded(principal.uid);
        return this.feed.like(user, dto.userId);
    }
    async pass(principal, dto) {
        const user = await this.users.requireOnboarded(principal.uid);
        return this.feed.pass(user, dto.userId);
    }
    async block(principal, dto) {
        const user = await this.users.require(principal.uid);
        return this.feed.block(user, dto.userId, dto.reason);
    }
};
exports.FeedController = FeedController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, auth_1.Auth)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, FeedQuery]),
    __metadata("design:returntype", Promise)
], FeedController.prototype, "list", null);
__decorate([
    (0, throttler_1.Throttle)({ default: { limit: 30, ttl: 60_000 } }),
    (0, common_1.Post)('like'),
    __param(0, (0, auth_1.Auth)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, TargetDto]),
    __metadata("design:returntype", Promise)
], FeedController.prototype, "like", null);
__decorate([
    (0, common_1.Post)('pass'),
    __param(0, (0, auth_1.Auth)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, TargetDto]),
    __metadata("design:returntype", Promise)
], FeedController.prototype, "pass", null);
__decorate([
    (0, common_1.Post)('block'),
    __param(0, (0, auth_1.Auth)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, BlockDto]),
    __metadata("design:returntype", Promise)
], FeedController.prototype, "block", null);
exports.FeedController = FeedController = __decorate([
    (0, common_1.Controller)('feed'),
    __metadata("design:paramtypes", [feed_service_1.FeedService,
        users_service_1.UsersService])
], FeedController);
//# sourceMappingURL=feed.controller.js.map