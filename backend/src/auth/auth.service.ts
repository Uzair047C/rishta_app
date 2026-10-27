import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Db } from '../db/db';
import { UserRow } from '../db/types';
import * as bcrypt from 'bcrypt';
import { getAuth } from 'firebase-admin/auth';
import { initializeApp, cert, getApps, App } from 'firebase-admin/app';

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
      firebasePayload.name
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
      [matchedToken.id, matchedToken.id]
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
    const { StreamChat } = await import('stream-chat');
    const serverClient = StreamChat.getInstance(streamApiKey, streamApiSecret);
    const token = serverClient.createToken(userId);

    return { token };
  }

  async validateUser(userId: string): Promise<UserRow | null> {
    return this.usersService.findOne(userId);
  }
}