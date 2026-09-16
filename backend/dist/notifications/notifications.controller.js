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
exports.NotificationsController = void 0;
const common_1 = require("@nestjs/common");
const class_validator_1 = require("class-validator");
const auth_1 = require("../auth/auth");
const users_service_1 = require("../users/users.service");
const db_1 = require("../db/db");
class PreferencesDto {
    newLike;
    newMatch;
    newMessage;
    marketing;
}
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], PreferencesDto.prototype, "newLike", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], PreferencesDto.prototype, "newMatch", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], PreferencesDto.prototype, "newMessage", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], PreferencesDto.prototype, "marketing", void 0);
class DeviceDto {
    token;
    platform;
}
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(4096),
    __metadata("design:type", String)
], DeviceDto.prototype, "token", void 0);
__decorate([
    (0, class_validator_1.IsIn)(['android', 'ios', 'web']),
    __metadata("design:type", String)
], DeviceDto.prototype, "platform", void 0);
/** camelCase API <-> snake_case column. Typed, so no name is built from input. */
const COLUMNS = {
    newLike: 'new_like',
    newMatch: 'new_match',
    newMessage: 'new_message',
    marketing: 'marketing',
};
let NotificationsController = class NotificationsController {
    db;
    users;
    constructor(db, users) {
        this.db = db;
        this.users = users;
    }
    /** Spec 1.2 — per-category toggles are expected by both app stores. */
    async get(principal) {
        const user = await this.users.require(principal.uid);
        // Defaults live in the schema; a missing row means "never configured".
        const row = await this.db.one(`INSERT INTO notification_preferences (user_id) VALUES ($1)
       ON CONFLICT (user_id) DO UPDATE SET user_id = EXCLUDED.user_id
       RETURNING *`, [user.id]);
        return {
            newLike: row?.new_like ?? true,
            newMatch: row?.new_match ?? true,
            newMessage: row?.new_message ?? true,
            marketing: row?.marketing ?? false,
        };
    }
    async update(principal, dto) {
        const user = await this.users.require(principal.uid);
        const entries = Object.entries(dto).filter(([, v]) => v !== undefined);
        if (!entries.length)
            return this.get(principal);
        const assignments = entries.map(([k], i) => `${COLUMNS[k]} = $${i + 2}`);
        const values = entries.map(([, v]) => v);
        await this.db.query(`INSERT INTO notification_preferences (user_id) VALUES ($1)
       ON CONFLICT (user_id) DO NOTHING`, [user.id]);
        await this.db.query(`UPDATE notification_preferences SET ${assignments.join(', ')} WHERE user_id = $1`, [user.id, ...values]);
        return this.get(principal);
    }
    /** Client calls this after FCM hands it a token. */
    async registerDevice(principal, dto) {
        const user = await this.users.require(principal.uid);
        // Token is the PK: a device that changes hands must move to the new owner.
        await this.db.query(`INSERT INTO device_tokens (token, user_id, platform) VALUES ($1, $2, $3)
       ON CONFLICT (token) DO UPDATE SET user_id = EXCLUDED.user_id, platform = EXCLUDED.platform`, [dto.token, user.id, dto.platform]);
        return { registered: true };
    }
    async unregisterDevice(principal, dto) {
        const user = await this.users.require(principal.uid);
        await this.db.query('DELETE FROM device_tokens WHERE token = $1 AND user_id = $2', [
            dto.token,
            user.id,
        ]);
        return { registered: false };
    }
};
exports.NotificationsController = NotificationsController;
__decorate([
    (0, common_1.Get)('preferences'),
    __param(0, (0, auth_1.Auth)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], NotificationsController.prototype, "get", null);
__decorate([
    (0, common_1.Put)('preferences'),
    __param(0, (0, auth_1.Auth)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, PreferencesDto]),
    __metadata("design:returntype", Promise)
], NotificationsController.prototype, "update", null);
__decorate([
    (0, common_1.Post)('device'),
    __param(0, (0, auth_1.Auth)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, DeviceDto]),
    __metadata("design:returntype", Promise)
], NotificationsController.prototype, "registerDevice", null);
__decorate([
    (0, common_1.Delete)('device'),
    __param(0, (0, auth_1.Auth)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, DeviceDto]),
    __metadata("design:returntype", Promise)
], NotificationsController.prototype, "unregisterDevice", null);
exports.NotificationsController = NotificationsController = __decorate([
    (0, common_1.Controller)('notifications'),
    __metadata("design:paramtypes", [db_1.Db,
        users_service_1.UsersService])
], NotificationsController);
//# sourceMappingURL=notifications.controller.js.map