import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { App, cert, getApps, initializeApp } from 'firebase-admin/app';
import { DecodedIdToken, getAuth } from 'firebase-admin/auth';

export interface Principal {
  uid: string;
  email: string | null;
  phone: string | null;
}

/** Minimal request shape — avoids depending on @types/express for two fields. */
interface GuardedRequest {
  headers: Record<string, string | string[] | undefined>;
  auth?: Principal;
}

const IS_PUBLIC = 'isPublic';

/** Marks a route as reachable without a Firebase ID token. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Injects the verified Principal. Replaces @Req() digging in every handler. */
export const Auth = createParamDecorator((_: unknown, ctx: ExecutionContext): Principal => {
  return ctx.switchToHttp().getRequest<{ auth: Principal }>().auth;
});

/**
 * Lazily initialized so the process boots (and /health answers) without
 * credentials configured — only actual token verification needs the key.
 */
let app: App | undefined;

export function firebaseApp(): App {
  if (app) return app;
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (!b64) throw new UnauthorizedException('firebase_not_configured');
  const existing = getApps()[0];
  app = existing ?? initializeApp({ credential: cert(JSON.parse(Buffer.from(b64, 'base64').toString())) });
  return app;
}

/** Verifies a Firebase ID token server-side. Used by the guard and by signup. */
export async function verifyIdToken(token: string): Promise<DecodedIdToken> {
  return getAuth(firebaseApp()).verifyIdToken(token);
}

/**
 * Global guard: every route requires a valid Firebase ID token unless marked
 * @Public(). Spec 2.1 — verification happens on every request, not just login.
 */
@Injectable()
export class FirebaseGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()])) {
      return true;
    }
    const req = ctx.switchToHttp().getRequest<GuardedRequest>();
    const header = req.headers.authorization;
    const token = typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) throw new UnauthorizedException('missing_bearer_token');
    try {
      const decoded = await verifyIdToken(token);
      req.auth = {
        uid: decoded.uid,
        email: decoded.email ?? null,
        phone: decoded.phone_number ?? null,
      };
      return true;
    } catch {
      throw new UnauthorizedException('invalid_token');
    }
  }
}
