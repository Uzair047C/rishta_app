import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

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

/** Mock principal for development when Firebase is removed */
const MOCK_PRINCIPAL: Principal = {
  uid: 'mock-user-id',
  email: 'mock@example.com',
  phone: null,
};

/**
 * Global guard: every route requires a valid Firebase ID token unless marked
 * @Public(). Spec 2.1 — verification happens on every request, not just login.
 *
 * With Firebase removed, this guard always allows access and sets a mock principal.
 */
@Injectable()
export class FirebaseGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()])) {
      return true;
    }
    const req = ctx.switchToHttp().getRequest<GuardedRequest>();
    // Always set mock principal for development
    req.auth = MOCK_PRINCIPAL;
    return true;
  }
}
