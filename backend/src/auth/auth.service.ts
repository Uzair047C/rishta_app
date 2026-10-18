import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Db } from '../db/db';
import { UserRow } from '../db/types';
import { OAuth2Client } from 'google-auth-library';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly db: Db,
  ) {}

  // Refresh token settings
  private readonly REFRESH_TOKEN_TTL_DAYS = 30;
  private readonly ACCESS_TOKEN_TTL_MINUTES = 15;

  async validateGoogleIdToken(idToken: string): Promise<{ email: string; googleId: string; emailVerified: boolean; name?: { givenName?: string; familyName?: string } }> {
    try {
      const client = new OAuth2Client();
      const audience = this.configService.get<string[]>('GOOGLE_CLIENT_IDS') ?? [];
      const ticket = await client.verifyIdToken({
        idToken,
        audience: audience.filter(Boolean),
      });
      const payload = ticket.getPayload();

      if (!payload) {
        throw new UnauthorizedException('Invalid ID token');
      }

      // Check issuer
      const allowedIssuers = ['accounts.google.com', 'https://accounts.google.com'];
      if (!allowedIssuers.includes(payload.iss)) {
        throw new UnauthorizedException('Invalid token issuer');
      }

      // Check email verified
      if (!payload.email_verified) {
        throw new UnauthorizedException('Email not verified with Google');
      }

      return {
        email: payload.email ?? '',
        googleId: payload.sub ?? '',
        emailVerified: payload.email_verified ?? false,
        name: {
          givenName: payload.given_name ?? undefined,
          familyName: payload.family_name ?? undefined,
        }
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid Google ID token');
    }
  }

  async googleLogin(idToken: string): Promise<{ accessToken: string; refreshToken: string; user: UserRow; profileComplete: boolean }> {
    const googlePayload = await this.validateGoogleIdToken(idToken);

    // Find or create user by Google ID
    const user = await this.usersService.findOrCreateByGoogleId(
      googlePayload.googleId,
      googlePayload.email,
      googlePayload.name?.givenName,
      googlePayload.name?.familyName
    );

    // Check if user has completed onboarding (has a profile)
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
    // Hash the provided refresh token to compare with stored hash
    const tokens = await this.db.all<{ id: string; user_id: string; token_hash: string; expires_at: Date; revoked_at: Date | null }>(
      'SELECT * FROM refresh_tokens WHERE expires_at > now() AND revoked_at IS NULL'
    );

    // Find matching token (bcrypt compare)
    let matchedToken: { id: string; user_id: string; token_hash: string; expires_at: Date } | null = null;
    for (const t of tokens) {
      if (await bcrypt.compare(refreshToken, t.token_hash)) {
        matchedToken = t;
        break;
      }
    }

    if (!matchedToken) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // Revoke the old token (rotating refresh token)
    await this.db.query(
      'UPDATE refresh_tokens SET revoked_at = now(), replaced_by = $1 WHERE id = $2',
      [matchedToken.id, matchedToken.id] // We'll set replaced_by after creating new one
    );

    // Issue new token pair
    const { accessToken, refreshToken: newRefreshToken } = await this.issueTokenPair(matchedToken.user_id);

    // Update the revoked token with replaced_by reference
    await this.db.query(
      'UPDATE refresh_tokens SET replaced_by = (SELECT id FROM refresh_tokens WHERE token_hash = $1 AND user_id = $2) WHERE id = $3',
      [await bcrypt.hash(newRefreshToken, 10), matchedToken.user_id, matchedToken.id]
    );

    return { accessToken, refreshToken: newRefreshToken };
  }

  private async issueTokenPair(userId: string): Promise<{ accessToken: string; refreshToken: string }> {
    const jwtSecret = this.configService.get<string>('JWT_SECRET');
    if (!jwtSecret) {
      throw new Error('JWT_SECRET is not configured');
    }

    // Generate access token (short-lived)
    const accessToken = this.jwtService.sign({ userId }, {
      secret: jwtSecret,
      expiresIn: `${this.ACCESS_TOKEN_TTL_MINUTES}m`,
    });

    // Generate refresh token (long-lived, random)
    const refreshToken = this.generateRefreshToken();
    const tokenHash = await bcrypt.hash(refreshToken, 10);
    const expiresAt = new Date(Date.now() + this.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

    await this.db.query(
      'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
      [userId, tokenHash, expiresAt]
    );

    return { accessToken, refreshToken };
  }

  private generateRefreshToken(): string {
    // 32 bytes = 256 bits of entropy
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Buffer.from(array).toString('base64url');
  }

  async logout(userId: string, refreshToken?: string): Promise<{ success: boolean }> {
    if (refreshToken) {
      // Revoke specific refresh token
      const tokens = await this.db.all<{ id: string; token_hash: string }>(
        'SELECT id, token_hash FROM refresh_tokens WHERE user_id = $1 AND revoked_at IS NULL',
        [userId]
      );
      for (const t of tokens) {
        if (await bcrypt.compare(refreshToken, t.token_hash)) {
          await this.db.query('UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1', [t.id]);
          break;
        }
      }
    } else {
      // Revoke all refresh tokens for user
      await this.db.query('UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [userId]);
    }
    return { success: true };
  }

  async getStreamToken(userId: string): Promise<{ token: string }> {
    const streamApiKey = this.configService.get<string>('STREAM_API_KEY');
    const streamApiSecret = this.configService.get<string>('STREAM_API_SECRET');

    if (!streamApiKey || !streamApiSecret) {
      throw new Error('Stream Chat not configured');
    }

    // Create a server-side Stream token for the user
    // Using the Stream Chat server-to-server auth pattern
    const { StreamChat } = await import('stream-chat');
    const serverClient = StreamChat.getInstance(streamApiKey, streamApiSecret);
    const token = serverClient.createToken(userId);

    return { token };
  }

  async validateUser(userId: string): Promise<UserRow | null> {
    return this.usersService.findOne(userId);
  }
}