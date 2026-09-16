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
var ModerationService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModerationService = void 0;
const common_1 = require("@nestjs/common");
const db_1 = require("../db/db");
const CLEAN = { flagged: false, labels: [], score: 0 };
/** ponytail: 5 MB ceiling — Rekognition's inline-bytes limit. Switch to an
 *  S3Object reference if users ever upload originals that large. */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
/**
 * Spec 2.5 — flags content for human review, does not hard-block on first pass.
 * Both providers degrade to passthrough when unconfigured, so the pipeline is
 * exercisable in development without cloud credentials; the flag row is still
 * written either way, which is what the review queue reads.
 */
let ModerationService = ModerationService_1 = class ModerationService {
    db;
    log = new common_1.Logger(ModerationService_1.name);
    constructor(db) {
        this.db = db;
    }
    async screenText(text, userId, source, refId) {
        const key = process.env.OPENAI_API_KEY;
        if (!key || !text.trim())
            return CLEAN;
        try {
            const res = await fetch('https://api.openai.com/v1/moderations', {
                method: 'POST',
                headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
                body: JSON.stringify({ input: text, model: 'omni-moderation-latest' }),
            });
            if (!res.ok)
                throw new Error(`openai ${res.status}`);
            const body = (await res.json());
            const top = body.results[0];
            const labels = Object.entries(top.category_scores)
                .filter(([, v]) => v > 0.5)
                .map(([k]) => k);
            if (top.flagged)
                await this.flag(userId, source, refId, text, labels, Math.max(...Object.values(top.category_scores)));
            return { flagged: top.flagged, labels, score: Math.max(0, ...Object.values(top.category_scores)) };
        }
        catch (err) {
            // Fail open, but loudly: a moderation outage must not take down posting.
            this.log.warn(`text moderation unavailable (${String(err)}); content not screened`);
            return CLEAN;
        }
    }
    async screenImage(userId, imageUrl, refId) {
        if (!process.env.AWS_ACCESS_KEY_ID)
            return CLEAN;
        try {
            const image = await fetch(imageUrl);
            if (!image.ok)
                throw new Error(`fetch ${image.status}`);
            const bytes = new Uint8Array(await image.arrayBuffer());
            if (bytes.byteLength > MAX_IMAGE_BYTES) {
                this.log.warn(`image ${refId ?? ''} exceeds ${MAX_IMAGE_BYTES}B; not screened`);
                return CLEAN;
            }
            const { RekognitionClient, DetectModerationLabelsCommand } = await Promise.resolve().then(() => __importStar(require('@aws-sdk/client-rekognition')));
            const client = new RekognitionClient({ region: process.env.AWS_REGION });
            const out = await client.send(new DetectModerationLabelsCommand({ Image: { Bytes: bytes }, MinConfidence: 60 }));
            const labels = (out.ModerationLabels ?? []).map((l) => l.Name ?? 'unknown');
            const score = Math.max(0, ...(out.ModerationLabels ?? []).map((l) => l.Confidence ?? 0));
            if (labels.length)
                await this.flag(userId, 'photo', refId, imageUrl, labels, score);
            return { flagged: labels.length > 0, labels, score };
        }
        catch (err) {
            this.log.warn(`image moderation unavailable (${String(err)}); content not screened`);
            return CLEAN;
        }
    }
    flag(userId, source, refId, content, labels, score) {
        return this.db.query(`INSERT INTO moderation_flags (user_id, source, ref_id, content, labels, score)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6)`, [userId, source, refId ?? null, content, JSON.stringify(labels), score]);
    }
};
exports.ModerationService = ModerationService;
exports.ModerationService = ModerationService = ModerationService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [db_1.Db])
], ModerationService);
//# sourceMappingURL=moderation.service.js.map