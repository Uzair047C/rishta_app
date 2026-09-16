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
Object.defineProperty(exports, "__esModule", { value: true });
exports.UsersService = void 0;
const common_1 = require("@nestjs/common");
const db_1 = require("../db/db");
/** ponytail: flat cap. Move to a per-device risk score if abuse shows up. */
const MAX_ACCOUNTS_PER_DEVICE = 3;
let UsersService = class UsersService {
    db;
    constructor(db) {
        this.db = db;
    }
    /** The caller's users row, or 401 if they never completed POST /auth/verify-token. */
    async require(uid) {
        const user = await this.db.one('SELECT * FROM users WHERE firebase_uid = $1', [uid]);
        if (!user)
            throw new common_1.UnauthorizedException('not_registered');
        return user;
    }
    /** Same, but also rejects callers who have not finished onboarding. */
    async requireOnboarded(uid) {
        const user = await this.require(uid);
        if (!user.gender)
            throw new common_1.ForbiddenException('profile_incomplete');
        return user;
    }
    /**
     * Idempotent signup. Safe to call on every app launch: an existing
     * firebase_uid is returned untouched rather than duplicated.
     */
    async provision(principal, deviceId) {
        const existing = await this.db.one('SELECT * FROM users WHERE firebase_uid = $1', [principal.uid]);
        if (existing)
            return existing;
        if (deviceId)
            await this.assertDeviceHasRoom(deviceId);
        const inserted = await this.db.one(`INSERT INTO users (firebase_uid, email, phone, phone_verified, device_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (firebase_uid) DO NOTHING
       RETURNING *`, [principal.uid, principal.email, principal.phone, Boolean(principal.phone), deviceId ?? null]);
        // Lost an insert race with a concurrent launch — the winner's row is fine.
        return inserted ?? this.require(principal.uid);
    }
    async assertDeviceHasRoom(deviceId) {
        const { n } = (await this.db.query('SELECT count(*)::int AS n FROM users WHERE device_id = $1', [deviceId])).rows[0];
        if (n >= MAX_ACCOUNTS_PER_DEVICE) {
            throw new common_1.ForbiddenException('device_account_limit_reached');
        }
    }
};
exports.UsersService = UsersService;
exports.UsersService = UsersService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [db_1.Db])
], UsersService);
//# sourceMappingURL=users.service.js.map