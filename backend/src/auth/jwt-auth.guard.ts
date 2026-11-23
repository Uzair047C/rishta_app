import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from './public.decorator';
import { Db } from '../db/db';
import { UserRow } from '../db/types';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly jwtSecret: string;
  private readonly jwtIssuer: string;
  private readonly jwtAudience: string;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly reflector: Reflector,
    private readonly db: Db,
  ) {
    // Read and validate JWT config once at module init
    const jwtSecret = this.configService.get<string>('JWT_SECRET');
    if (!jwtSecret) {
      throw new Error('JWT_SECRET is not configured');
    }
    if (jwtSecret.length < 32) {
      throw new Error('JWT_SECRET must be at least 32 characters');
    }
    this.jwtSecret = jwtSecret;
    this.jwtIssuer = this.configService.get<string>('JWT_ISSUER') ?? 'rishta-api';
    this.jwtAudience = this.configService.get<string>('JWT_AUDIENCE') ?? 'rishta-app';
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if route is marked as @Public()
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Invalid authorization header');
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    try {
      // Verify token with cached secret, iss, and aud
      const payload = this.jwtService.verify(token, {
        secret: this.jwtSecret,
        issuer: this.jwtIssuer,
        audience: this.jwtAudience,
      });

      // Fetch the whole user on every request — a suspended/banned user must be
      // cut off the moment an admin flips their status, so nothing is cached.
      const user = await this.db.oneOrNone<UserRow>('SELECT * FROM users WHERE id = $1', [payload.userId]);
      if (!user) {
        throw new UnauthorizedException('User not found');
      }
      if (user.status && user.status !== 'active') {
        throw new ForbiddenException(`account_${user.status}`);
      }

      request.user = user;
      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException || error instanceof ForbiddenException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
