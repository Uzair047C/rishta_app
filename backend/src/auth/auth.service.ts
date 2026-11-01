import { Injectable, UnauthorizedException, ConflictException, NotFoundException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Db } from '../db/db';
import { UserRow } from '../db/types';
import { getAuth } from 'firebase-admin/auth';
import { initializeApp, cert, getApps, App } from 'firebase-admin/app';
import { createHash, randomBytes } from 'crypto';

@Injectable()
export class AuthService {
  private readonly firebaseApp: App;

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly db: Db,
  ) {
    // Initialize Firebase Admin SDK
    this.firebaseApp = this.initializeFirebase();
  }

  private initializeFirebase(): App {
    if (getApps().length > 0) {
      return getApps()[0];
    }

    const projectId = this.configService.get<string>('FIREBASE_PROJECT_ID');
    const clientEmail = this.configService.get<string>('FIREBASE_CLIENT_EMAIL');
    const privateKey = this.configService.get<string>('FIREBASE_PRIVATE_KEY')?.replace(/\\n/g, '\n');

    if (!projectId || !clientEmail || !privateKey) {
      throw new Error('Firebase Admin credentials not configured (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY)');
    }

    return initializeApp({
      credential: cert({ projectId, clientEmail, privateKey }),
    });
  }

  // Refresh token settings
  private readonly REFRESH_TOKEN_TTL_DAYS = 30;
  private readonly ACCESS_TOKEN_TTL_MINUTES = 15;

  // SHA-256 hash for refresh token (high-entropy token, no bcrypt needed)
  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async validateFirebaseIdToken(idToken: string): Promise<{ firebaseUid: string; email: string; emailVerified: boolean; name?: string }> {
    try {
      const decodedToken = await getAuth(this.firebaseApp).verifyIdToken(idToken, true);

      return {
        firebaseUid: decodedToken.uid,
        email: decodedToken.email ?? '',
        emailVerified: decodedToken.email_verified ?? false,
        name: decodedToken.name ?? undefined,
      };
    } catch (error) {
      throw new UnauthorizedException('Invalid Firebase ID token');
    }
  }

  async firebaseLogin(idToken: string): Promise<{ accessToken: string; refreshToken: string; user: UserRow; profileComplete: boolean }> {
    const firebasePayload = await this.validateFirebaseIdToken(idToken);

    // Find or create user by Firebase UID
    const user = await this.usersService.findOrCreateByFirebaseUid(
      firebasePayload.firebaseUid,
      firebasePayload.email,
      firebasePayload.name,
      firebasePayload.emailVerified // Pass emailVerified
    );

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
    return this.db.tx(async (conn) => {
      // Look up token by hash directly (O(1) with unique index)
      const existingToken = await conn.oneOrNone<{
        id: string;
        user_id: string;
        token_hash: string;
        expires_at: Date;
        revoked_at: Date | null;
        family_id: string;
        replaced_by: string | null;
      }>(
        'SELECT id, user_id, token_hash, expires_at, revoked_at, family_id, replaced_by FROM refresh_tokens WHERE token_hash = $1',
        [tokenHash]
      );

      if (!existingToken) {
        throw new UnauthorizedException('Invalid or expired refresh token');
      }

      if (existingToken.revoked_at) {
        // Reuse detection: token was already used and revoked
        if (existingToken.replaced_by) {
          // Revoke entire family - potential token theft
          // Do this in a separate committed statement
          await conn.query(
            'UPDATE refresh_tokens SET revoked_at = now() WHERE family_id = $1 AND revoked_at IS NULL',
            [existingToken.family_id]
          );
        }
        throw new UnauthorizedException('Token reuse detected - session revoked');
      }

      if (existingToken.expires_at < new Date()) {
        throw new UnauthorizedException('Refresh token expired');
      }

      // Check user is active (banned users can't refresh)
      const user = await conn.oneOrNone<{ id: string; status: string | null }>(
        'SELECT id, status FROM users WHERE id = $1',
        [existingToken.user_id]
      );
      if (!user || user.status !== 'active') {
        // Revoke all tokens of banned/inactive user
        await conn.query(
          'UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL',
          [existingToken.user_id]
        );
        throw new UnauthorizedException('User inactive or banned');
      }

      // Generate new token pair - INHERIT family_id from parent (only fresh login creates new family)
      const newRefreshToken = this.generateRefreshToken();
      const newTokenHash = this.hashToken(newRefreshToken);
      const inheritedFamilyId = existingToken.family_id; // Inherit family_id
      const expiresAt = new Date(Date.now() + this.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

      // Insert new token with inherited family_id
      const newToken = await conn.one<{ id: string }>(
        'INSERT INTO refresh_tokens (user_id, token_hash, family_id, expires_at) VALUES ($1, $2, $3, $4) RETURNING id',
        [existingToken.user_id, newTokenHash, inheritedFamilyId, expiresAt]
      );
      if (!newToken) throw new Error('Failed to create new refresh token');

      // Revoke old token and link to new one
      await conn.query(
        'UPDATE refresh_tokens SET revoked_at = now(), replaced_by = $1 WHERE id = $2',
        [newToken.id, existingToken.id]
      );

      // Issue new access token
      const jwtSecret = this.configService.get<string>('JWT_SECRET')!;
      const accessToken = this.jwtService.sign({ userId: existingToken.user_id }, {
        secret: jwtSecret,
        expiresIn: `${this.ACCESS_TOKEN_TTL_MINUTES}m`,
        issuer: this.configService.get<string>('JWT_ISSUER') ?? 'rishta-api',
        audience: this.configService.get<string>('JWT_AUDIENCE') ?? 'rishta-app',
      });

      return { accessToken, refreshToken: newRefreshToken };
    });
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

  private getStreamClient() {
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