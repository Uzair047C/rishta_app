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
exports.VerificationController = void 0;
const common_1 = require("@nestjs/common");
const class_validator_1 = require("class-validator");
const auth_1 = require("../auth/auth");
const users_service_1 = require("../users/users.service");
const verification_service_1 = require("./verification.service");
class SelfieDto {
    /** Session from POST /verification/liveness-session, recorded by the client SDK. */
    livenessSessionId;
    /** Only used by the development passthrough; ignored in production. */
    selfieUrl;
}
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(256),
    __metadata("design:type", String)
], SelfieDto.prototype, "livenessSessionId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUrl)({ require_tld: false }),
    __metadata("design:type", String)
], SelfieDto.prototype, "selfieUrl", void 0);
let VerificationController = class VerificationController {
    verification;
    users;
    constructor(verification, users) {
        this.verification = verification;
        this.users = users;
    }
    /** Step 1 — client records a liveness video into this session. */
    async livenessSession(principal) {
        await this.users.requireOnboarded(principal.uid);
        return this.verification.createLivenessSession();
    }
    /** Step 2 — server pulls the liveness result and face-matches it. */
    async selfie(principal, dto) {
        const user = await this.users.requireOnboarded(principal.uid);
        return this.verification.submit(user, dto.livenessSessionId, dto.selfieUrl);
    }
    /** Drives the pending/verified/failed screen. */
    async status(principal) {
        const user = await this.users.require(principal.uid);
        return this.verification.status(user.id);
    }
};
exports.VerificationController = VerificationController;
__decorate([
    (0, common_1.Post)('liveness-session'),
    __param(0, (0, auth_1.Auth)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], VerificationController.prototype, "livenessSession", null);
__decorate([
    (0, common_1.Post)('selfie'),
    __param(0, (0, auth_1.Auth)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, SelfieDto]),
    __metadata("design:returntype", Promise)
], VerificationController.prototype, "selfie", null);
__decorate([
    (0, common_1.Get)('status'),
    __param(0, (0, auth_1.Auth)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], VerificationController.prototype, "status", null);
exports.VerificationController = VerificationController = __decorate([
    (0, common_1.Controller)('verification'),
    __metadata("design:paramtypes", [verification_service_1.VerificationService,
        users_service_1.UsersService])
], VerificationController);
//# sourceMappingURL=verification.controller.js.map