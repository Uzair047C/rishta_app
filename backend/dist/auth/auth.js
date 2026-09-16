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
exports.FirebaseGuard = exports.Auth = exports.Public = void 0;
exports.firebaseApp = firebaseApp;
exports.verifyIdToken = verifyIdToken;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const app_1 = require("firebase-admin/app");
const auth_1 = require("firebase-admin/auth");
const IS_PUBLIC = 'isPublic';
/** Marks a route as reachable without a Firebase ID token. */
const Public = () => (0, common_1.SetMetadata)(IS_PUBLIC, true);
exports.Public = Public;
/** Injects the verified Principal. Replaces @Req() digging in every handler. */
exports.Auth = (0, common_1.createParamDecorator)((_, ctx) => {
    return ctx.switchToHttp().getRequest().auth;
});
/**
 * Lazily initialized so the process boots (and /health answers) without
 * credentials configured — only actual token verification needs the key.
 */
let app;
function firebaseApp() {
    if (app)
        return app;
    const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
    if (!b64)
        throw new common_1.UnauthorizedException('firebase_not_configured');
    const existing = (0, app_1.getApps)()[0];
    app = existing ?? (0, app_1.initializeApp)({ credential: (0, app_1.cert)(JSON.parse(Buffer.from(b64, 'base64').toString())) });
    return app;
}
/** Verifies a Firebase ID token server-side. Used by the guard and by signup. */
async function verifyIdToken(token) {
    return (0, auth_1.getAuth)(firebaseApp()).verifyIdToken(token);
}
/**
 * Global guard: every route requires a valid Firebase ID token unless marked
 * @Public(). Spec 2.1 — verification happens on every request, not just login.
 */
let FirebaseGuard = class FirebaseGuard {
    reflector;
    constructor(reflector) {
        this.reflector = reflector;
    }
    async canActivate(ctx) {
        if (this.reflector.getAllAndOverride(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()])) {
            return true;
        }
        const req = ctx.switchToHttp().getRequest();
        const header = req.headers.authorization;
        const token = typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : undefined;
        if (!token)
            throw new common_1.UnauthorizedException('missing_bearer_token');
        try {
            const decoded = await verifyIdToken(token);
            req.auth = {
                uid: decoded.uid,
                email: decoded.email ?? null,
                phone: decoded.phone_number ?? null,
            };
            return true;
        }
        catch {
            throw new common_1.UnauthorizedException('invalid_token');
        }
    }
};
exports.FirebaseGuard = FirebaseGuard;
exports.FirebaseGuard = FirebaseGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [core_1.Reflector])
], FirebaseGuard);
//# sourceMappingURL=auth.js.map