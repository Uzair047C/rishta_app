import { Injectable, UnauthorizedException, ConflictException, ForbiddenException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Db } from '../db/db';
import { UserRow } from '../db/types';
import { getAuth } from 'firebase-admin/auth';
import { initializeApp, cert, getApps, App } from 'firebase-admin/app';
import { createHash, randomBytes } from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import { StreamService } from '../chat/stream.service';
import { ConsentDto } from './dto/auth.dto';

@Injectable()
export class AuthService {
  private readonly firebaseApp: App;
  private readonly oauthClient: OAuth2Client;
  private readonly googleClientIds: string[];

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly db: Db,
    private readonly stream: StreamService,
  ) {
    // Initialize Firebase Admin SDK
    this.firebaseApp = this.initializeFirebase();

    // Raw Google OAuth verification: audience = every client ID in GOOGLE_CLIENT_IDS
    this.googleClientIds = (this.configService.get<string>('GOOGLE_CLIENT_IDS') ?? '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    if (this.googleClientIds.length === 0) {
      throw new Error('GOOGLE_CLIENT_IDS is not configured (comma-separated Web/Android/iOS client IDs)');
    }
    this.oauthClient = new OAuth2Client();
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

  async validateFirebaseIdToken(idToken: string): Promise<{ firebaseUid: string; email: string; emailVerified: boolean; phone?: string; name?: string }> {
    try {
      const decodedToken = await getAuth(this.firebaseApp).verifyIdToken(idToken, true);

      return {
        firebaseUid: decodedToken.uid,
        email: decodedToken.email ?? '',
        emailVerified: decodedToken.email_verified ?? false,
        // firebase.phone_number is present on phone-auth ID tokens
        phone: (decodedToken as { phone_number?: string }).phone_number,
        name: decodedToken.name ?? undefined,
      };
    } catch (error) {
      throw new UnauthorizedException('Invalid Firebase ID token');
    }
  }

  /** Shared tail of both login paths: block non-active users, check onboarding, issue tokens. */
  private async finishLogin(
    user: UserRow,
    consent?: ConsentDto[],
  ): Promise<{ accessToken: string; refreshToken: string; user: UserRow; profileComplete: boolean }> {
    if (user.status && user.status !== 'active') {
      throw new ForbiddenException(`account_${user.status}`);
    }

    if (consent && consent.length > 0) {
      await this.recordConsent(user.id, consent);
    }

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

    return { accessToken, refreshToken, user, profileComplete };
  }

  async firebaseLogin(idToken: string, consent?: ConsentDto[]): Promise<{ accessToken: string; refreshToken: string; user: UserRow; profileComplete: boolean }> {
    const firebasePayload = await this.validateFirebaseIdToken(idToken);

    // Phone-auth tokens carry a phone_number claim and no email — route them
    // to the phone-aware find-or-create.
    const user = firebasePayload.phone
      ? await this.findOrCreateByPhone(firebasePayload.firebaseUid, firebasePayload.phone)
      : await this.usersService.findOrCreateByFirebaseUid(
          firebasePayload.firebaseUid,
          firebasePayload.email,
          firebasePayload.name,
          firebasePayload.emailVerified,
        );

    return this.finishLogin(user, consent);
  }

  /**
   * Raw Google Sign-In: verifies a Google-issued ID token with google-auth-library.
   * Find-or-create keyed on the Google `sub` (stored as provider_subject).
   */
  async googleLogin(idToken: string, consent?: ConsentDto[]): Promise<{ accessToken: string; refreshToken: string; user: UserRow; profileComplete: boolean }> {
    let ticket;
    try {
      ticket = await this.oauthClient.verifyIdToken({ idToken, audience: this.googleClientIds });
    } catch {
      throw new UnauthorizedException('Invalid Google ID token');
    }

    const payload = ticket.getPayload();
    if (!payload?.sub) {
      throw new UnauthorizedException('Invalid Google ID token');
    }
    if (!payload.email_verified) {
      throw new UnauthorizedException('Google account email is not verified');
    }

    const user = await this.findOrCreateByGoogleSub(payload.sub, payload.email ?? '', payload.name);

    return this.finishLogin(user, consent);
  }

  /** Upsert the client-captured consent timestamps. Best-effort: a failed
   * insert must not block sign-in. */
  private async recordConsent(userId: string, consent: ConsentDto[]): Promise<void> {
    try {
      for (const c of consent) {
        await this.db.query(
          `INSERT INTO user_consents (user_id, document, accepted_at)
           VALUES ($1, $2, $3)
           ON CONFLICT (user_id, document) DO NOTHING`,
          [userId, c.document, c.acceptedAt],
        );
      }
    } catch (err) {
      // ponytail: log-and-continue; consent is re-sent on next login
      this.configService.get<never>('NODE_ENV') === 'production'
        ? console.error('consent_record_failed', err)
        : console.warn('consent_record_failed', err);
    }
  }

  /** Find-or-create keyed on the Google `sub`; reuses the verified-email link logic. */
  private async findOrCreateByGoogleSub(googleSub: string, email: string, name?: string): Promise<UserRow> {
    // Existing Google-linked user
    const existing = await this.db.oneOrNone<UserRow>(
      "SELECT * FROM users WHERE auth_provider = 'google' AND provider_subject = $1",
      [googleSub],
    );
    if (existing) return existing;

    // Otherwise delegate: links by verified email or creates a new row with
    // the Google sub stored as firebase_uid (the app's primary provider key).
    return this.usersService.findOrCreateByFirebaseUid(googleSub, email, name, true);
  }

  // Phone OTP: the client (firebase_auth package) handles SMS delivery and
  // returns an ID token with a phone_number claim — the same /auth/firebase
  // exchange covers it. findOrCreateByPhone links/creates on that claim.

  private async findOrCreateByPhone(firebaseUid: string, phone: string): Promise<UserRow> {
    // Existing account with this Firebase UID — attach the phone if missing.
    let user = await this.db.oneOrNone<UserRow>(
      'SELECT * FROM users WHERE firebase_uid = $1',
      [firebaseUid],
    );
    if (user) {
      if (!user.phone) {
        await this.db.query('UPDATE users SET phone = $1, phone_verified = true WHERE id = $2', [phone, user.id]);
        user.phone = phone;
        user.phone_verified = true;
      }
      return user;
    }

    // Existing account already verified with this phone — link the UID.
    user = await this.db.oneOrNone<UserRow>(
      'SELECT * FROM users WHERE phone = $1 AND phone_verified = true',
      [phone],
    );
    if (user) {
      await this.db.query('UPDATE users SET firebase_uid = $1 WHERE id = $2', [firebaseUid, user.id]);
      user.firebase_uid = firebaseUid;
      return user;
    }

    // New phone-only user.
    const created = await this.db.one<UserRow>(
      `INSERT INTO users (phone, phone_verified, firebase_uid, email_verified)
       VALUES ($1, true, $2, false)
       ON CONFLICT (firebase_uid) DO UPDATE SET phone = EXCLUDED.phone, phone_verified = true
       RETURNING *`,
      [phone, firebaseUid],
    );
    return created!;
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

      // Suspended/banned users cannot mint new tokens
      const row = await conn.oneOrNone<{ status: string | null }>(
        'SELECT status FROM users WHERE id = $1',
        [existingToken.user_id],
      );
      if (row?.status && row.status !== 'active') {
        throw new ForbiddenException(`account_${row.status}`);
      }

      // Generate new token pair
      const newRefreshToken = this.generateRefreshToken();
      const newTokenHash = this.hashToken(newRefreshToken);
      const newFamilyId = randomBytes(16).toString('hex');
      const expiresAt = new Date(Date.now() + this.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

      // Insert new token first
      const newToken = await conn.one<{ id: string }>(
        'INSERT INTO refresh_tokens (user_id, token_hash, family_id, expires_at) VALUES ($1, $2, $3, $4) RETURNING id',
        [existingToken.user_id, newTokenHash, newFamilyId, expiresAt]
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
      // Revoke this token's family, scoped to the calling user (a stolen token
      // must not be able to log other users out).
      const tokenHash = this.hashToken(refreshToken);
      const token = await this.db.oneOrNone<{ family_id: string }>(
        'SELECT family_id FROM refresh_tokens WHERE token_hash = $1 AND user_id = $2',
        [tokenHash, userId]
      );
      if (token) {
        await this.db.query(
          'UPDATE refresh_tokens SET revoked_at = now() WHERE family_id = $1 AND user_id = $2 AND revoked_at IS NULL',
          [token.family_id, userId]
        );
      }
    } else {
      // Revoke all refresh tokens for user
      await this.db.query('UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [userId]);
    }
    return { success: true };
  }

  async getStreamToken(userId: string): Promise<{ token: string; expiresAt: number }> {
    return this.stream.issueToken(userId);
  }

  async validateUser(userId: string): Promise<UserRow | null> {
    return this.usersService.findOne(userId);
  }

  async getProfileSummary(userId: string): Promise<{
    userId: string;
    email: string;
    emailVerified: boolean;
    authProvider: string | null;
    firebaseUid: string | null;
    status: string;
    createdAt: Date;
    onboardingComplete: boolean;
    verificationStatus: string | null;
    subscriptionPlan: string;
  }> {
    const user = await this.usersService.findOne(userId);
    if (!user) {
      throw new Error('User not found');
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
      authProvider: user.auth_provider,
      firebaseUid: user.firebase_uid,
      status: user.status ?? 'active',
      createdAt: user.created_at,
      onboardingComplete,
      verificationStatus: profile?.verification_status ?? 'pending',
      subscriptionPlan: subscription?.plan ?? 'free',
    };
  }
}