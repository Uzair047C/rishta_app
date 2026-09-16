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
exports.ProfileService = void 0;
const common_1 = require("@nestjs/common");
const db_1 = require("../db/db");
const moderation_service_1 = require("../moderation/moderation.service");
const verification_service_1 = require("../verification/verification.service");
const MAX_PHOTOS = 6;
let ProfileService = class ProfileService {
    db;
    moderation;
    verification;
    constructor(db, moderation, verification) {
        this.db = db;
        this.moderation = moderation;
        this.verification = verification;
    }
    interests() {
        return this.db.repo('interests').all('SELECT id, label FROM interests ORDER BY label');
    }
    languages() {
        return this.db.repo('languages').all('SELECT id, label FROM languages ORDER BY label');
    }
    async upsert(user, dto) {
        const bio = dto.bio ?? '';
        const screening = await this.moderation.screenText(bio, user.id, 'bio', user.id);
        try {
            await this.db.tx(async (conn) => {
                // The users_min_age trigger rejects dob under 18 here regardless of what
                // the client sent — spec 2.3, server-side age enforcement.
                await conn.query(`UPDATE users SET gender = $2, dob = $3, location = $4, lat = $5, lng = $6 WHERE id = $1`, [user.id, dto.gender, dto.dob, dto.location ?? null, dto.lat ?? null, dto.lng ?? null]);
                await conn.query(`INSERT INTO profiles (user_id, name, bio, education, profession, marital_status, bio_flagged)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (user_id) DO UPDATE SET
             name = EXCLUDED.name,
             bio = EXCLUDED.bio,
             education = EXCLUDED.education,
             profession = EXCLUDED.profession,
             marital_status = EXCLUDED.marital_status,
             bio_flagged = EXCLUDED.bio_flagged,
             updated_at = now()`, [
                    user.id,
                    dto.name,
                    bio,
                    dto.education ?? null,
                    dto.profession ?? null,
                    dto.maritalStatus ?? null,
                    screening.flagged,
                ]);
                await this.replaceTags(conn, 'user_interests', 'interest_id', user.id, dto.interestIds);
                await this.replaceTags(conn, 'user_languages', 'language_id', user.id, dto.languageIds);
            });
        }
        catch (err) {
            if (err.message?.includes('under_min_age')) {
                throw new common_1.BadRequestException('under_min_age');
            }
            throw err;
        }
        return this.me(user.id);
    }
    /**
     * Spec 1.2 — photos arrive pre-uploaded to storage by the client; this endpoint
     * records the URL, screens it, and re-opens verification when it is primary.
     */
    async addPhoto(userId, url, makePrimary) {
        const existing = await this.db.one('SELECT * FROM profiles WHERE user_id = $1', [userId]);
        const photos = existing?.photos ?? [];
        if (!existing) {
            await this.db.query('INSERT INTO profiles (user_id) VALUES ($1)', [userId]);
        }
        if (photos.length >= MAX_PHOTOS)
            throw new common_1.BadRequestException('photo_limit_reached');
        const isPrimary = makePrimary ?? photos.length === 0;
        const previousPrimary = photos[0];
        const next = isPrimary ? [url, ...photos] : [...photos, url];
        await this.moderation.screenImage(userId, url, `${userId}:${next.length}`);
        await this.db.query('UPDATE profiles SET photos = $2, updated_at = now() WHERE user_id = $1', [
            userId,
            next,
        ]);
        // The trigger already reset verification_status to 'pending'; this records
        // the audit event that the pending screen and review queue read.
        if (isPrimary && previousPrimary !== url) {
            await this.verification.reopen(userId, previousPrimary ? 'primary_photo_changed' : 'initial_photo');
        }
        return { photos: next, primaryPhoto: next[0], reVerificationRequired: isPrimary };
    }
    async me(userId) {
        const [user, profile, interests, languages] = await Promise.all([
            this.db.one('SELECT id, email, phone, phone_verified, gender, dob, location, lat, lng, created_at FROM users WHERE id = $1', [userId]),
            this.db.one('SELECT * FROM profiles WHERE user_id = $1', [userId]),
            this.db.repo('interests').all(`SELECT i.id, i.label FROM interests i
         JOIN user_interests ui ON ui.interest_id = i.id WHERE ui.user_id = $1 ORDER BY i.label`, [userId]),
            this.db.repo('languages').all(`SELECT l.id, l.label FROM languages l
         JOIN user_languages ul ON ul.language_id = l.id WHERE ul.user_id = $1 ORDER BY l.label`, [userId]),
        ]);
        return {
            user,
            profile: profile && { ...profile, primaryPhoto: profile.photos[0] ?? null },
            interests,
            languages,
        };
    }
    async replaceTags(conn, table, column, userId, ids) {
        await conn.query(`DELETE FROM ${table} WHERE user_id = $1`, [userId]);
        if (!ids?.length)
            return;
        // unnest + join keeps this one round trip and drops ids that aren't real tags.
        await conn.query(`INSERT INTO ${table} (user_id, ${column})
       SELECT $1, t.id FROM unnest($2::int[]) AS t(id)
       JOIN ${column === 'interest_id' ? 'interests' : 'languages'} x ON x.id = t.id
       ON CONFLICT DO NOTHING`, [userId, ids]);
    }
};
exports.ProfileService = ProfileService;
exports.ProfileService = ProfileService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [db_1.Db,
        moderation_service_1.ModerationService,
        verification_service_1.VerificationService])
], ProfileService);
//# sourceMappingURL=profile.service.js.map