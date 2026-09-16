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
exports.ReportsController = void 0;
const common_1 = require("@nestjs/common");
const throttler_1 = require("@nestjs/throttler");
const class_validator_1 = require("class-validator");
const auth_1 = require("../auth/auth");
const users_service_1 = require("../users/users.service");
const db_1 = require("../db/db");
class ReportDto {
    reportedId;
    reason;
    matchId;
    messageId;
}
__decorate([
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], ReportDto.prototype, "reportedId", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(3),
    (0, class_validator_1.MaxLength)(500),
    __metadata("design:type", String)
], ReportDto.prototype, "reason", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], ReportDto.prototype, "matchId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], ReportDto.prototype, "messageId", void 0);
let ReportsController = class ReportsController {
    db;
    users;
    constructor(db, users) {
        this.db = db;
        this.users = users;
    }
    /**
     * Spec 2.5 — reports feed the same human review queue as automated flags.
     * Reported but not blocked: the two actions stay independent (spec 1.2).
     */
    async create(principal, dto) {
        const user = await this.users.require(principal.uid);
        if (user.id === dto.reportedId)
            throw new common_1.BadRequestException('cannot_report_self');
        const report = await this.db.one(`INSERT INTO reports (reporter_id, reported_id, match_id, message_id, reason)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, status, created_at`, [user.id, dto.reportedId, dto.matchId ?? null, dto.messageId ?? null, dto.reason]);
        return { report };
    }
};
exports.ReportsController = ReportsController;
__decorate([
    (0, throttler_1.Throttle)({ default: { limit: 10, ttl: 60_000 } }),
    (0, common_1.Post)(),
    __param(0, (0, auth_1.Auth)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, ReportDto]),
    __metadata("design:returntype", Promise)
], ReportsController.prototype, "create", null);
exports.ReportsController = ReportsController = __decorate([
    (0, common_1.Controller)('reports'),
    __metadata("design:paramtypes", [db_1.Db,
        users_service_1.UsersService])
], ReportsController);
//# sourceMappingURL=reports.controller.js.map