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
exports.MatchesController = void 0;
const common_1 = require("@nestjs/common");
const auth_1 = require("../auth/auth");
const users_service_1 = require("../users/users.service");
const db_1 = require("../db/db");
let MatchesController = class MatchesController {
    db;
    users;
    constructor(db, users) {
        this.db = db;
        this.users = users;
    }
    /**
     * Spec 1.2 — reads are deliberately NOT gated on subscription status. An
     * expired plan must not lock existing conversation.
     */
    async list(principal) {
        const user = await this.users.require(principal.uid);
        const matches = await this.db.all(`SELECT m.id AS match_id, m.matched_at,
              u.id AS user_id, u.gender, u.location,
              EXTRACT(YEAR FROM age(u.dob))::int AS age,
              p.name, p.bio, p.photos, p.verification_status
         FROM matches m
         JOIN users u
           ON u.id = CASE WHEN m.user_a_id = $1 THEN m.user_b_id ELSE m.user_a_id END
         JOIN profiles p ON p.user_id = u.id
        WHERE (m.user_a_id = $1 OR m.user_b_id = $1)
          AND m.unmatched_at IS NULL
          AND NOT EXISTS (
                SELECT 1 FROM blocks b
                 WHERE (b.blocker_id = $1 AND b.blocked_id = u.id)
                    OR (b.blocked_id = $1 AND b.blocker_id = u.id))
        ORDER BY m.matched_at DESC`, [user.id]);
        return { matches };
    }
    /** Spec 1.2 — unmatch is distinct from report/block; it only ends the match. */
    async unmatch(principal, id) {
        const user = await this.users.require(principal.uid);
        const updated = await this.db.query(`UPDATE matches SET unmatched_at = now()
        WHERE id = $1 AND unmatched_at IS NULL AND (user_a_id = $2 OR user_b_id = $2)
        RETURNING id`, [id, user.id]);
        if (!updated.rowCount)
            throw new common_1.NotFoundException('match_not_found');
        return { unmatched: true, matchId: id };
    }
};
exports.MatchesController = MatchesController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, auth_1.Auth)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], MatchesController.prototype, "list", null);
__decorate([
    (0, common_1.Delete)(':id'),
    __param(0, (0, auth_1.Auth)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], MatchesController.prototype, "unmatch", null);
exports.MatchesController = MatchesController = __decorate([
    (0, common_1.Controller)('matches'),
    __metadata("design:paramtypes", [db_1.Db,
        users_service_1.UsersService])
], MatchesController);
//# sourceMappingURL=matches.controller.js.map