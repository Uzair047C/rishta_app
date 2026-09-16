"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var PushService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PushService = void 0;
const common_1 = require("@nestjs/common");
const db_1 = require("../db/db");
const auth_1 = require("../auth/auth");
/** Typed map, so the preference column is never built from caller input. */
const PREFERENCE_COLUMN = {
    new_like: 'new_like',
    new_match: 'new_match',
    new_message: 'new_message',
};
let PushService = PushService_1 = class PushService {
    db;
    log = new common_1.Logger(PushService_1.name);
    constructor(db) {
        this.db = db;
    }
    /**
     * Spec 1.2/2.1 — triggered server-side on like/match/message. Respects the
     * recipient's per-category toggle and never throws: a push failure must not
     * fail the like that caused it.
     */
    async toUser(userId, category, data) {
        try {
            const prefs = await this.db.one('SELECT * FROM notification_preferences WHERE user_id = $1', [userId]);
            const column = PREFERENCE_COLUMN[category];
            // Absent row means "never touched the screen" -> defaults apply, which are on.
            if (prefs && prefs[column] === false)
                return;
            const tokens = await this.db.all('SELECT token FROM device_tokens WHERE user_id = $1', [userId]);
            if (!tokens.length)
                return;
            const { getMessaging } = await Promise.resolve().then(() => __importStar(require('firebase-admin/messaging')));
            const res = await getMessaging((0, auth_1.firebaseApp)()).sendEachForMulticast({
                tokens: tokens.map((t) => t.token),
                data: { category, ...data },
                android: { priority: 'high' },
                apns: { payload: { aps: { contentAvailable: true } } },
            });
            await this.prune(res.responses, tokens.map((t) => t.token));
        }
        catch (err) {
            this.log.warn(`push to ${userId} failed: ${String(err)}`);
        }
    }
    /** Drops tokens FCM reports as gone so the table does not grow forever. */
    async prune(responses, tokens) {
        const dead = tokens.filter((_, i) => {
            const code = responses[i]?.error?.code;
            return (code === 'messaging/registration-token-not-registered' ||
                code === 'messaging/invalid-registration-token');
        });
        if (dead.length)
            await this.db.query('DELETE FROM device_tokens WHERE token = ANY($1)', [dead]);
    }
};
exports.PushService = PushService;
exports.PushService = PushService = PushService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [db_1.Db])
], PushService);
//# sourceMappingURL=push.service.js.map