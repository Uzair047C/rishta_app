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
var VerificationService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.VerificationService = void 0;
const common_1 = require("@nestjs/common");
const db_1 = require("../db/db");
/** Rekognition's default CompareFaces similarity floor. */
const FACE_MATCH_THRESHOLD = Number(process.env.REKOGNITION_FACE_MATCH_THRESHOLD ?? 90);
/** CognitiveServices Face Liveness confidence floor. */
const LIVENESS_THRESHOLD = 80;
let VerificationService = VerificationService_1 = class VerificationService {
    db;
    log = new common_1.Logger(VerificationService_1.name);
    constructor(db) {
        this.db = db;
    }
    /** True when the deployment cannot actually verify anyone. */
    get awsConfigured() {
        return Boolean(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_ACCESS_KEY_ID.length > 0);
    }
    /**
     * Refuses rather than silently auto-approving. A dev-only passthrough exists
     * so the flow is testable locally, but it is gated on NODE_ENV and logs a
     * warning on every use — an unconfigured provider must never pass silently.
     */
    assertProvider() {
        if (this.awsConfigured)
            return true;
        if (process.env.NODE_ENV === 'production') {
            throw new common_1.ServiceUnavailableException('verification_provider_not_configured');
        }
        this.log.warn('AWS not configured — auto-approving verification. DEVELOPMENT ONLY.');
        return false;
    }
    /** Creates a Rekognition Face Liveness session for the client SDK to record into. */
    async createLivenessSession() {
        if (!this.assertProvider())
            return { sessionId: null, devBypass: true };
        const { RekognitionClient, CreateFaceLivenessSessionCommand } = await Promise.resolve().then(() => __importStar(require('@aws-sdk/client-rekognition')));
        const client = new RekognitionClient({ region: process.env.AWS_REGION });
        const out = await client.send(new CreateFaceLivenessSessionCommand({}));
        return { sessionId: out.SessionId ?? null, devBypass: false };
    }
    /**
     * Spec 1.2/2.3 — submits a live selfie for liveness + face match against the
     * primary profile photo. One row per attempt, including re-verifications.
     */
    async submit(user, livenessSessionId, selfieUrl) {
        const profile = await this.db.one('SELECT * FROM profiles WHERE user_id = $1', [user.id]);
        const primaryPhoto = profile?.photos?.[0];
        if (!primaryPhoto)
            throw new common_1.BadRequestException('no_primary_photo');
        if (!this.assertProvider())
            return this.record(user.id, selfieUrl ?? 'dev://bypass', null, null, 'verified', 'dev_bypass');
        try {
            const { RekognitionClient, GetFaceLivenessSessionResultsCommand, CompareFacesCommand } = await Promise.resolve().then(() => __importStar(require('@aws-sdk/client-rekognition')));
            const client = new RekognitionClient({ region: process.env.AWS_REGION });
            if (!livenessSessionId)
                throw new common_1.BadRequestException('liveness_session_required');
            const liveness = await client.send(new GetFaceLivenessSessionResultsCommand({ SessionId: livenessSessionId }));
            const livenessScore = liveness.Confidence ?? 0;
            if (liveness.Status !== 'SUCCEEDED' || livenessScore < LIVENESS_THRESHOLD) {
                return this.record(user.id, `liveness://${livenessSessionId}`, null, livenessScore, 'failed', 'liveness_failed');
            }
            const reference = liveness.ReferenceImage?.Bytes;
            if (!reference)
                return this.record(user.id, `liveness://${livenessSessionId}`, null, livenessScore, 'failed', 'no_reference_image');
            const target = await fetch(primaryPhoto);
            if (!target.ok)
                throw new common_1.BadRequestException('primary_photo_unreachable');
            const targetBytes = new Uint8Array(await target.arrayBuffer());
            const compared = await client.send(new CompareFacesCommand({
                SourceImage: { Bytes: reference },
                TargetImage: { Bytes: targetBytes },
                SimilarityThreshold: FACE_MATCH_THRESHOLD,
            }));
            const matchScore = compared.FaceMatches?.[0]?.Similarity ?? 0;
            const passed = matchScore >= FACE_MATCH_THRESHOLD;
            return this.record(user.id, `liveness://${livenessSessionId}`, matchScore, livenessScore, passed ? 'verified' : 'failed', passed ? null : 'face_mismatch');
        }
        catch (err) {
            if (err instanceof common_1.BadRequestException)
                throw err;
            this.log.error(`verification failed: ${String(err)}`);
            return this.record(user.id, `liveness://${livenessSessionId}`, null, null, 'failed', 'provider_error');
        }
    }
    /**
     * Spec 2.3 — re-opens verification after a primary-photo change. The
     * profiles.verification_status reset itself is enforced by a DB trigger;
     * this adds the audit row and is what the enqueue would hand to a worker.
     */
    reopen(userId, reason) {
        return this.record(userId, 'pending://reverification', null, null, 'pending', reason);
    }
    async status(userId) {
        const latest = await this.db.one('SELECT * FROM verification_events WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1', [userId]);
        return {
            status: latest?.result ?? 'pending',
            reason: latest?.reason ?? null,
            updatedAt: latest?.created_at ?? null,
        };
    }
    /** Records the attempt and moves profiles.verification_status to match. */
    async record(userId, selfieUrl, matchScore, livenessScore, result, reason) {
        await this.db.tx(async (conn) => {
            await conn.query(`INSERT INTO verification_events (user_id, selfie_url, match_score, liveness_score, result, reason)
         VALUES ($1, $2, $3, $4, $5, $6)`, [userId, selfieUrl, matchScore, livenessScore, result, reason]);
            // Direct write, not via Repo: the trigger on profiles only reacts to photo
            // changes, so a plain status update here passes through untouched.
            await conn.query('UPDATE profiles SET verification_status = $2 WHERE user_id = $1', [
                userId,
                result,
            ]);
        });
        return { status: result, reason, updatedAt: new Date() };
    }
};
exports.VerificationService = VerificationService;
exports.VerificationService = VerificationService = VerificationService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [db_1.Db])
], VerificationService);
//# sourceMappingURL=verification.service.js.map