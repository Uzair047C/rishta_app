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
exports.AuthController = void 0;
const common_1 = require("@nestjs/common");
const class_validator_1 = require("class-validator");
const auth_1 = require("./auth");
const users_service_1 = require("../users/users.service");
const db_1 = require("../db/db");
const stream_token_1 = require("./stream-token");
class VerifyTokenDto {
    /** Firebase App Check / device fingerprint — second layer against multi-accounting. */
    deviceId;
}
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(128),
    __metadata("design:type", String)
], VerifyTokenDto.prototype, "deviceId", void 0);
let AuthController = class AuthController {
    users;
    db;
    constructor(users, db) {
        this.users = users;
        this.db = db;
    }
    /**
     * Exchanges a verified Firebase ID token for an app session (i.e. a users row).
     * Idempotent — the client calls it on every cold start.
     */
    async verifyToken(principal, dto) {
        const user = await this.users.provision(principal, dto.deviceId);
        return {
            user,
            onboarding: {
                profileComplete: Boolean(user.gender),
                verificationRequired: true,
            },
        };
    }
    /**
     * Confirms phone OTP. The number is read from the *verified token*, never from
     * the request body — otherwise a caller could claim any number and the unique
     * index would be the only thing standing between them and someone's account.
     */
    async phoneVerify(principal) {
        if (!principal.phone)
            return { phoneVerified: false, reason: 'token_has_no_phone_number' };
        const user = await this.users.require(principal.uid);
        try {
            const updated = await this.db.one(`UPDATE users SET phone = $2, phone_verified = true
         WHERE id = $1 RETURNING id, phone, phone_verified`, [user.id, principal.phone]);
            return { phoneVerified: true, user: updated };
        }
        catch (err) {
            // Unique violation on users_phone_verified_uniq -> spec 2.3 duplicate accounts.
            if (err.code === '23505') {
                throw new common_1.ConflictException('phone_already_registered');
            }
            throw err;
        }
    }
    /** Short-lived Stream Chat token, issued only after Firebase auth succeeds (spec 2.1). */
    async streamToken(principal) {
        const user = await this.users.require(principal.uid);
        return { token: (0, stream_token_1.streamToken)(user.id) };
    }
    health() {
        return { ok: true };
    }
};
exports.AuthController = AuthController;
__decorate([
    (0, common_1.Post)('verify-token'),
    __param(0, (0, auth_1.Auth)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, VerifyTokenDto]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "verifyToken", null);
__decorate([
    (0, common_1.Post)('phone/verify'),
    __param(0, (0, auth_1.Auth)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "phoneVerify", null);
__decorate([
    (0, common_1.Get)('stream-token'),
    __param(0, (0, auth_1.Auth)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "streamToken", null);
__decorate([
    (0, auth_1.Public)(),
    (0, common_1.Get)('health'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "health", null);
exports.AuthController = AuthController = __decorate([
    (0, common_1.Controller)('auth'),
    __metadata("design:paramtypes", [users_service_1.UsersService,
        db_1.Db])
], AuthController);
//# sourceMappingURL=auth.controller.js.map