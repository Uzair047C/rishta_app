import { Injectable, UnauthorizedException, NotFoundException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Db } from '../db/db';
import { UserRow } from '../db/types';
import { createHash, randomBytes } from 'crypto';
import { OAuth2Client } from 'google-auth-library';

@Injectable()
export class AuthService {
  private readonly googleOAuthClient = new OAuth2Client();

  // Refresh token settings (read from config with defaults matching validation.ts)
  private readonly REFRESH_TOKEN_TTL_DAYS: number;
  private readonly ACCESS_TOKEN_TTL_MINUTES: number;
  private readonly REFRESH_GRACE_WINDOW_MS = 20000; // 20s grace window for network flakiness

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly db: Db,
  ) {
    // Read from config after injection (can't use 'this' in field initializers)
    this.REFRESH_TOKEN_TTL_DAYS = parseInt(this.configService.get<string>('JWT_REFRESH_TTL_DAYS') ?? '30', 10);
    this.ACCESS_TOKEN_TTL_MINUTES = parseInt(this.configService.get<string>('JWT_ACCESS_TTL_MINUTES') ?? '15', 10);
  }

  // SHA-256 hash for refresh token (high-entropy token, no bcrypt needed)
  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async validateGoogleIdToken(idToken: string): Promise<{ googleId: string; email: string }> {
    const audiences = this.configService.get<string>('GOOGLE_CLIENT_IDS')
      ?.split(',')
      .map((clientId) => clientId.trim())
      .filter(Boolean);

    if (!audiences?.length) {
      throw new Error('GOOGLE_CLIENT_IDS is not configured');
    }

    try {
      const ticket = await this.googleOAuthClient.verifyIdToken({
        idToken,
        audience: audiences,
      });
      const payload = ticket.getPayload();
      if (!payload?.sub || !payload.email || payload.email_verified !== true) {
        throw new UnauthorizedException('Google account must have a verified email');
      }

      return { googleId: payload.sub, email: payload.email };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid Google ID token');
    }
  }

  async googleLogin(idToken: string): Promise<{ accessToken: string; refreshToken: string; user: UserRow; profileComplete: boolean }> {
    const googlePayload = await this.validateGoogleIdToken(idToken);
    const user = await this.usersService.findOrCreateByGoogleId(
      googlePayload.googleId,
      googlePayload.email,
      true
    );

    return this.createSessionForUser(user);
  }

  private async createSessionForUser(user: UserRow): Promise<{ accessToken: string; refreshToken: string; user: UserRow; profileComplete: boolean }> {
    // Check if user has completed onboarding
    let profileComplete = false;
    try {
      await this.usersService.requireOnboarded(user.id);
      profileComplete = true;
    } catch (err) {
      if (err instanceof Error && err.message === 'profile_incomplete') {
        profileComplete = false;
      } else {
        throw err;
      }
    }

    // Update last_active on login
    await this.db.query('UPDATE users SET last_active = now() WHERE id = $1', [user.id]);

    // Generate tokens
    const { accessToken, refreshToken } = await this.issueTokenPair(user.id);

    return {
      accessToken,
      refreshToken,
      user,
      profileComplete,
    };
  }

  async refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    const tokenHash = this.hashToken(refreshToken);

    // Atomic rotation with reuse detection in single transaction
    // Returns { userId, familyId, isReuse, isBanned, newRefreshToken } for post-commit actions
    const result = await this.db.tx(async (conn) => {
      // Atomic rotation: revoke old and insert new in one statement using CTE
      const newRefreshToken = this.generateRefreshToken();
      const newTokenHash = this.hashToken(newRefreshToken);
      const expiresAt = new Date(Date.now() + this.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

      const rotationResult = await conn.oneOrNone<{
        id: string;
        user_id: string;
        family_id: string;
        replaced_by: string | null;
        revoked_at: Date | null;
        expires_at: Date;
        user_status: string | null;
      }>(`
        WITH new_token AS (
          INSERT INTO refresh_tokens (user_id, token_hash, family_id, expires_at)
          SELECT user_id, $2, family_id, $3
          FROM refresh_tokens
          WHERE token_hash = $1
            AND revoked_at IS NULL
            AND expires_at > now()
          RETURNING id, user_id, family_id
        ), rotated AS (
          UPDATE refresh_tokens
          SET revoked_at = now(), replaced_by = new_token.id
          FROM new_token
          WHERE refresh_tokens.id = new_token.id
          RETURNING refresh_tokens.id, refresh_tokens.user_id, refresh_tokens.family_id,
                    refresh_tokens.replaced_by, refresh_tokens.revoked_at, refresh_tokens.expires_at
        )
        SELECT r.id, r.user_id, r.family_id, r.replaced_by, r.revoked_at, r.expires_at, u.status AS user_status
        FROM rotated r
        JOIN users u ON u.id = r.user_id
      `, [tokenHash, newTokenHash, expiresAt]);

      if (!rotationResult) {
        // No row updated - either token not found, already revoked, or expired
        // Need to check which case for proper error
        const existingToken = await conn.oneOrNone<{
          id: string;
          user_id: string;
          family_id: string;
          revoked_at: Date | null;
          expires_at: Date;
          replaced_by: string | null;
        }>(
          'SELECT id, user_id, family_id, revoked_at, expires_at, replaced_by FROM refresh_tokens WHERE token_hash = $1',
          [tokenHash]
        );

        if (!existingToken) {
          return { error: 'invalid', userId: null, familyId: null, isReuse: false, isBanned: false };
        }

        if (existingToken.revoked_at) {
          if (existingToken.replaced_by) {
            // Check grace window: if revoked recently, accept once and return same successor
            const successor = await conn.oneOrNone<{
              id: string;
              token_hash: string;
              revoked_at: Date | null;
              expires_at: Date;
            }>(
              'SELECT id, token_hash, revoked_at, expires_at FROM refresh_tokens WHERE id = $1',
              [existingToken.replaced_by]
            );
            if (successor && !successor.revoked_at && successor.expires_at > new Date()) {
              const revokedAt = new Date(existingToken.revoked_at).getTime();
              const now = Date.now();
              if (now - revokedAt <= this.REFRESH_GRACE_WINDOW_MS) {
                // Grace window: return the same successor token
                return {
                  error: null,
                  userId: existingToken.user_id,
                  familyId: existingToken.family_id,
                  isReuse: false,
                  isBanned: false,
                  newRefreshToken: null, // client already has this token
                  accessToken: this.jwtService.sign({ userId: existingToken.user_id }, {
                    secret: this.configService.get<string>('JWT_SECRET')!,
                    expiresIn: `${this.ACCESS_TOKEN_TTL_MINUTES}m`,
                    issuer: this.configService.get<string>('JWT_ISSUER') ?? 'rishta-api',
                    audience: this.configService.get<string>('JWT_AUDIENCE') ?? 'rishta-app',
                  }),
                };
              }
            }
            // Reuse detected outside grace window - revoke family
            return { error: 'reuse', userId: existingToken.user_id, familyId: existingToken.family_id, isReuse: true, isBanned: false };
          }
          return { error: 'revoked', userId: existingToken.user_id, familyId: existingToken.family_id, isReuse: false, isBanned: false };
        }

        if (existingToken.expires_at < new Date()) {
          return { error: 'expired', userId: existingToken.user_id, familyId: existingToken.family_id, isReuse: false, isBanned: false };
        }

        // Check user status
        const user = await conn.oneOrNone<{ id: string; status: string | null }>(
          'SELECT id, status FROM users WHERE id = $1',
          [existingToken.user_id]
        );
        if (!user || user.status !== 'active') {
          return { error: 'banned', userId: existingToken.user_id, familyId: existingToken.family_id, isReuse: false, isBanned: true };
        }

        return { error: 'unknown', userId: null, familyId: null, isReuse: false, isBanned: false };
      }

      // Valid rotation - check user status
      if (!rotationResult.user_status || rotationResult.user_status !== 'active') {
        return { error: 'banned', userId: rotationResult.user_id, familyId: rotationResult.family_id, isReuse: false, isBanned: true };
      }

      // Success - return data for post-commit actions
      return {
        error: null,
        userId: rotationResult.user_id,
        familyId: rotationResult.family_id,
        isReuse: false,
        isBanned: false,
        newRefreshToken,
        accessToken: this.jwtService.sign({ userId: rotationResult.user_id }, {
          secret: this.configService.get<string>('JWT_SECRET')!,
          expiresIn: `${this.ACCESS_TOKEN_TTL_MINUTES}m`,
          issuer: this.configService.get<string>('JWT_ISSUER') ?? 'rishta-api',
          audience: this.configService.get<string>('JWT_AUDIENCE') ?? 'rishta-app',
        }),
      };
    });

    // Post-commit error handling
    if (result.error === 'invalid' || result.error === 'revoked' || result.error === 'expired') {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
    if (result.error === 'reuse') {
      // Revoke family after commit
      await this.db.query(
        'UPDATE refresh_tokens SET revoked_at = now() WHERE family_id = $1 AND revoked_at IS NULL',
        [result.familyId]
      );
      throw new UnauthorizedException('Token reuse detected - session revoked');
    }
    if (result.error === 'banned') {
      // Revoke all user tokens after commit
      await this.db.query(
        'UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL',
        [result.userId]
      );
      throw new UnauthorizedException('User inactive or banned');
    }

    return { accessToken: result.accessToken!, refreshToken: result.newRefreshToken! };
  }

  private async issueTokenPair(userId: string): Promise<{ accessToken: string; refreshToken: string }> {
    const jwtSecret = this.configService.get<string>('JWT_SECRET');
    if (!jwtSecret) {
      throw new Error('JWT_SECRET is not configured');
    }

    // Generate access token with iss/aud claims
    const accessToken = this.jwtService.sign({ userId }, {
      secret: jwtSecret,
      expiresIn: `${this.ACCESS_TOKEN_TTL_MINUTES}m`,
      issuer: this.configService.get<string>('JWT_ISSUER') ?? 'rishta-api',
      audience: this.configService.get<string>('JWT_AUDIENCE') ?? 'rishta-app',
    });

    // Generate refresh token (high-entropy, SHA-256 stored)
    const refreshToken = this.generateRefreshToken();
    const tokenHash = this.hashToken(refreshToken);
    const familyId = randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + this.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

    await this.db.query(
      'INSERT INTO refresh_tokens (user_id, token_hash, family_id, expires_at) VALUES ($1, $2, $3, $4)',
      [userId, tokenHash, familyId, expiresAt]
    );

    return { accessToken, refreshToken };
  }

  private generateRefreshToken(): string {
    // 32 bytes = 256 bits of entropy
    return randomBytes(32).toString('base64url');
  }

  async logout(userId: string, refreshToken?: string): Promise<{ success: boolean }> {
    if (refreshToken) {
      // Revoke specific refresh token (and its family for security)
      const tokenHash = this.hashToken(refreshToken);
      const token = await this.db.oneOrNone<{ id: string; family_id: string }>(
        'SELECT id, family_id FROM refresh_tokens WHERE token_hash = $1',
        [tokenHash]
      );
      if (token) {
        // Revoke entire family to prevent any reuse
        await this.db.query(
          'UPDATE refresh_tokens SET revoked_at = now() WHERE family_id = $1 AND revoked_at IS NULL',
          [token.family_id]
        );
      }
    } else {
      // Revoke all refresh tokens for user
      await this.db.query('UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [userId]);
    }
    return { success: true };
  }

  private streamClient: any = null;

  /** Get Stream Chat client (public for FeedService to freeze channels on block). */
  getStreamClient() {
    if (!this.streamClient) {
      const streamApiKey = this.configService.get<string>('STREAM_API_KEY');
      const streamApiSecret = this.configService.get<string>('STREAM_API_SECRET');

      if (!streamApiKey || !streamApiSecret) {
        throw new Error('Stream Chat not configured');
      }

      const { StreamChat } = require('stream-chat');
      this.streamClient = StreamChat.getInstance(streamApiKey, streamApiSecret);
    }
    return this.streamClient;
  }

  async getStreamToken(userId: string): Promise<{ token: string; expiresAt: number }> {
    const client = this.getStreamClient();

    // Create token with 1 hour expiry (iat and exp passed explicitly)
    const iat = Math.floor(Date.now() / 1000);
    const exp = iat + 3600; // 1 hour
    const token = client.createToken(userId, exp, iat);
    const expiresAt = exp;

    // Only upsert user with name/image when missing (not on every request)
    // This avoids overwriting name/image from profile
    try {
      await client.upsertUser({
        id: userId,
        role: 'user',
      }, { upsert: false }); // Only create if missing, don't overwrite
    } catch {
      // User might already exist, ignore
    }

    return { token, expiresAt };
  }

  async validateUser(userId: string): Promise<UserRow | null> {
    return this.usersService.findOne(userId);
  }

  async getProfileSummary(userId: string): Promise<{
    userId: string;
    email: string;
    emailVerified: boolean;
    status: string;
    createdAt: Date;
    onboardingComplete: boolean;
    verificationStatus: string | null;
    subscriptionPlan: string;
  }> {
    const user = await this.usersService.findOne(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check onboarding completion
    let onboardingComplete = false;
    try {
      await this.usersService.requireOnboarded(userId);
      onboardingComplete = true;
    } catch {
      onboardingComplete = false;
    }

    // Get profile for verification status
    const profile = await this.db.oneOrNone<{ verification_status: string }>(
      'SELECT verification_status FROM profiles WHERE user_id = $1',
      [userId]
    );

    // Get subscription plan
    const subscription = await this.db.oneOrNone<{ plan: string }>(
      'SELECT plan FROM subscriptions WHERE user_id = $1',
      [userId]
    );

    return {
      userId: user.id,
      email: user.email ?? '',
      emailVerified: user.email_verified,
      status: user.status ?? 'active',
      createdAt: user.created_at,
      onboardingComplete,
      verificationStatus: profile?.verification_status ?? 'pending',
      subscriptionPlan: subscription?.plan ?? 'free',
    };
  }
}