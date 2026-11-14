import { ForbiddenException, Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { Db } from '../db/db';
import { UserRow } from '../db/types';

@Injectable()
export class UsersService {
  constructor(private readonly db: Db) {}

  /** Get a specific user by ID. Throws if not found. */
  async require(userId: string): Promise<UserRow> {
    const user = await this.db.oneOrNone<UserRow>('SELECT * FROM users WHERE id = $1', [userId]);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  /** Get a specific user by ID and verify they have completed onboarding. */
  async requireOnboarded(userId: string): Promise<UserRow> {
    const user = await this.require(userId);

    const profile = await this.db.oneOrNone(
      `SELECT 1 FROM profiles
       WHERE user_id = $1
       AND name IS NOT NULL
       AND photos IS NOT NULL
       AND array_length(photos, 1) > 0`,
      [user.id]
    );
    if (!profile) {
      throw new ForbiddenException('profile_incomplete');
    }
    if (!user.gender || !user.dob) {
      throw new ForbiddenException('profile_incomplete');
    }
    return user;
  }

  /** Find or create a user by the verified Google subject. */
  async findOrCreateByGoogleId(
    googleId: string,
    email: string,
    emailVerified: boolean = false
  ): Promise<UserRow> {
    if (!googleId || !email || !emailVerified) {
      throw new ConflictException('Google account must provide a verified email');
    }

    let user = await this.db.oneOrNone<UserRow>(
      'SELECT * FROM users WHERE auth_provider = $1 AND provider_subject = $2',
      ['google', googleId]
    );

    if (user) {
      if (!user.email_verified) {
        await this.db.query(
          'UPDATE users SET email_verified = true WHERE id = $1',
          [user.id]
        );
        user.email_verified = true;
      }
      return user;
    }

    user = await this.db.oneOrNone<UserRow>(
      'SELECT * FROM users WHERE lower(email) = $1 AND email_verified = true',
      [email.toLowerCase()]
    );

    if (user) {
      if (user.auth_provider && user.auth_provider !== 'google' && user.auth_provider !== 'firebase') {
        throw new ConflictException('account_exists_with_different_provider');
      }

      await this.db.query(
        `UPDATE users SET
           auth_provider = 'google',
           provider_subject = $2,
           email_verified = true
         WHERE id = $1`,
        [user.id, googleId]
      );
      user.auth_provider = 'google';
      user.provider_subject = googleId;
      user.email_verified = true;
      return user;
    }

    const createdUser = await this.db.one<UserRow>(
      `INSERT INTO users (email, phone, phone_verified, gender, dob, location, lat, lng, device_id, auth_provider, provider_subject, email_verified)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (auth_provider, provider_subject) WHERE provider_subject IS NOT NULL DO UPDATE SET
         email_verified = true
       RETURNING *`,
      [
        email,
        null,
        false,
        null,
        null,
        null,
        null,
        null,
        null,
        'google',
        googleId,
        true,
      ]
    );
    if (!createdUser) {
      throw new Error('Failed to create Google-authenticated user');
    }
    return createdUser;
  }

  /** Find a user by ID. Returns null if not found. */
  async findOne(userId: string): Promise<UserRow | null> {
    return this.db.oneOrNone<UserRow>('SELECT * FROM users WHERE id = $1', [userId]);
  }

  /** Find a user by ID. Throws if not found. */
  async findOneOrFail(userId: string): Promise<UserRow> {
    const user = await this.db.oneOrNone<UserRow>('SELECT * FROM users WHERE id = $1', [userId]);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }
}