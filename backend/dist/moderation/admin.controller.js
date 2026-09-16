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
exports.AdminController = exports.AdminGuard = void 0;
const common_1 = require("@nestjs/common");
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
const auth_1 = require("../auth/auth");
const users_service_1 = require("../users/users.service");
const db_1 = require("../db/db");
const QUEUE_STATUSES = ['open', 'reviewing', 'actioned', 'dismissed'];
class QueueQuery {
    status = 'open';
    limit = 50;
}
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(QUEUE_STATUSES),
    __metadata("design:type", String)
], QueueQuery.prototype, "status", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    __metadata("design:type", Number)
], QueueQuery.prototype, "limit", void 0);
class QueueActionDto {
    status;
    note;
}
__decorate([
    (0, class_validator_1.IsIn)(QUEUE_STATUSES),
    __metadata("design:type", String)
], QueueActionDto.prototype, "status", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], QueueActionDto.prototype, "note", void 0);
/**
 * Minimal admin gate. An env allowlist rather than a users.is_admin column —
 * a schema change and a migration for a list that only changes at deploy time
 * is not worth it. Move to a role table when there is more than one kind of admin.
 */
let AdminGuard = class AdminGuard {
    users;
    constructor(users) {
        this.users = users;
    }
    async canActivate(ctx) {
        const allowed = (process.env.ADMIN_USER_IDS ?? '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
        const principal = ctx.switchToHttp().getRequest().auth;
        if (!principal)
            throw new common_1.ForbiddenException('admin_only');
        const user = await this.users.require(principal.uid);
        if (!allowed.includes(user.id))
            throw new common_1.ForbiddenException('admin_only');
        return true;
    }
};
exports.AdminGuard = AdminGuard;
exports.AdminGuard = AdminGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [users_service_1.UsersService])
], AdminGuard);
/** Spec 2.6 step 8 — the human review interface over the flagging pipeline. */
let AdminController = class AdminController {
    db;
    users;
    constructor(db, users) {
        this.db = db;
        this.users = users;
    }
    /** Submissions flagged by the automated screeners, oldest first. */
    async flags(query) {
        const flags = await this.db.all(`SELECT f.*, u.email AS user_email
         FROM moderation_flags f
         LEFT JOIN users u ON u.id = f.user_id
        WHERE f.status = $1
        ORDER BY f.created_at ASC
        LIMIT $2`, [query.status, Math.min(query.limit, 200)]);
        return { flags };
    }
    /** Reports filed by users. */
    async reports(query) {
        const reports = await this.db.all(`SELECT r.*, reporter.email AS reporter_email, reported.email AS reported_email
         FROM reports r
         LEFT JOIN users reporter ON reporter.id = r.reporter_id
         LEFT JOIN users reported ON reported.id = r.reported_id
        WHERE r.status = $1
        ORDER BY r.created_at ASC
        LIMIT $2`, [query.status, Math.min(query.limit, 200)]);
        return { reports };
    }
    async resolveFlag(id, dto) {
        await this.db.query('UPDATE moderation_flags SET status = $2 WHERE id = $1', [id, dto.status]);
        return { id, status: dto.status };
    }
    async resolveReport(id, dto) {
        await this.db.query('UPDATE reports SET status = $2 WHERE id = $1', [id, dto.status]);
        return { id, status: dto.status };
    }
    /** Reviewers are users too, so the id is resolved the same way. */
    async whoami(principal) {
        const user = await this.users.require(principal.uid);
        return { userId: user.id };
    }
};
exports.AdminController = AdminController;
__decorate([
    (0, common_1.Get)('flags'),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [QueueQuery]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "flags", null);
__decorate([
    (0, common_1.Get)('reports'),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [QueueQuery]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "reports", null);
__decorate([
    (0, common_1.Patch)('flags/:id'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, QueueActionDto]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "resolveFlag", null);
__decorate([
    (0, common_1.Patch)('reports/:id'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, QueueActionDto]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "resolveReport", null);
__decorate([
    (0, common_1.Get)('whoami'),
    __param(0, (0, auth_1.Auth)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "whoami", null);
exports.AdminController = AdminController = __decorate([
    (0, common_1.Controller)('admin'),
    (0, common_1.UseGuards)(AdminGuard),
    __metadata("design:paramtypes", [db_1.Db,
        users_service_1.UsersService])
], AdminController);
//# sourceMappingURL=admin.controller.js.map