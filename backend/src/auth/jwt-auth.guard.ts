import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from './public.decorator';
import { Db } from '../db/db';
import { UserRow } from '../db/types';

interface UserStatusCache {
  status: string;
  expiresAt: number;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly jwtSecret: string;
  private readonly jwtIssuer: string;
  private readonly jwtAudience: string;
  private readonly userStatusCache = new Map<string, UserStatusCache>();
  private readonly CACHE_TTL_MS = 30_000; // 30 seconds

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

      // Fetch full user from database and attach to request
      const user = await this.getUserWithCachedStatus(payload.userId);
      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      request.user = user;
      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  private async getUserWithCachedStatus(userId: string): Promise<UserRow | null> {
    // Check cache first
    const cached = this.userStatusCache.get(userId);
    const now = Date.now();
    if (cached && cached.expiresAt > now) {
      // Return user with cached status - need to fetch full user once then use cached status
      const user = await this.db.oneOrNone<UserRow>('SELECT * FROM users WHERE id = $1', [userId]);
      if (user) {
        user.status = cached.status as UserRow['status'];
      }
      return user;
    }

    // Fetch from DB
    const user = await this.db.oneOrNone<UserRow>('SELECT * FROM users WHERE id = $1', [userId]);
    if (!user) {
      return null;
    }

    // Cache the status
    this.userStatusCache.set(userId, {
      status: user.status ?? 'active',
      expiresAt: now + this.CACHE_TTL_MS,
    });

    // Clean up expired cache entries periodically
    if (this.userStatusCache.size > 1000) {
      for (const [key, value] of this.userStatusCache.entries()) {
        if (value.expiresAt <= now) {
          this.userStatusCache.delete(key);
        }
      }
    }

    return user;
  }
}