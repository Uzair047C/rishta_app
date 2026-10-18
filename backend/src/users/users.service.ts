import { ForbiddenException, Injectable } from '@nestjs/common';
import { Db } from '../db/db';
import { UserRow } from '../db/types';

@Injectable()
export class UsersService {
  constructor(private readonly db: Db) {}

  /** Get a specific user by ID. Throws if not found. */
  async require(userId: string): Promise<UserRow> {
    const user = await this.db.oneOrNone<UserRow>('SELECT * FROM users WHERE id = $1', [userId]);
    if (!user) {
      throw new Error('User not found');
    }
    return user;
  }

  /** Get a specific user by ID and verify they have completed onboarding. */
  async requireOnboarded(userId: string): Promise<UserRow> {
    const user = await this.require(userId);

    const profile = await this.db.oneOrNone('SELECT 1 FROM profiles WHERE user_id = $1', [user.id]);
    if (!profile) {
      throw new ForbiddenException('profile_incomplete');
    }
    return user;
  }

  /**
   * Idempotent provision. Safe to call on every app launch: returns the user if exists or creates one.
   * @deprecated Use require() with authenticated user ID instead
   */
  async provision(deviceId?: string): Promise<UserRow> {
    // This method is kept for backward compatibility but should not be used in new code
    // It returns the first user or creates one if none exist
    let user = await this.db.oneOrNone<UserRow>('SELECT * FROM users LIMIT 1');
    if (!user) {
      user = await this.db.one<UserRow>(
        'INSERT INTO users (email, phone, phone_verified, gender, dob, location, lat, lng, device_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *',
        [null, null, false, null, null, null, null, null, deviceId ?? null]
      );
    }
    return user!;
  }

  /**
   * Find or create a user by Google ID.
   * Primary identifier is (auth_provider='google', provider_subject=googleId).
   * If no match but a user with the same verified email exists and has no provider identity, link it.
   * If that email is already linked to a different provider subject, return conflict.
   */
  async findOrCreateByGoogleId(
    googleId: string,
    email: string,
    firstName?: string,
    lastName?: string
  ): Promise<UserRow> {
    if (!email) {
      throw new Error('Email not provided from Google');
    }

    // First try to find by Google ID
    let user = await this.db.oneOrNone<UserRow>(
      'SELECT * FROM users WHERE auth_provider = $1 AND provider_subject = $2',
      ['google', googleId]
    );

    if (user) {
      // Update email_verified if Google says it's verified
      await this.db.query(
        'UPDATE users SET email_verified = true WHERE id = $1',
        [user.id]
      );
      return user;
    }

    // If no Google ID match, look for user with this email
    user = await this.db.oneOrNone<UserRow>(
      'SELECT * FROM users WHERE email = $1 AND email_verified = true',
      [email]
    );

    if (user) {
      // Check if this user already has a provider identity
      const existingProvider = await this.db.oneOrNone<{ auth_provider: string | null; provider_subject: string | null }>(
        'SELECT auth_provider, provider_subject FROM users WHERE id = $1 AND auth_provider IS NOT NULL',
        [user.id]
      );

      if (existingProvider && existingProvider.auth_provider) {
        // User already has a different provider identity - conflict
        if (existingProvider.auth_provider !== 'google' || existingProvider.provider_subject !== googleId) {
          throw new Error('Account already exists with different provider');
        }
        // Same provider, just update if needed
        await this.db.query(
          'UPDATE users SET email_verified = true WHERE id = $1',
          [user.id]
        );
        return user;
      }

      // No existing provider, link this Google account to the user
      await this.db.query(
        `UPDATE users SET
         auth_provider = $2,
         provider_subject = $3,
         email_verified = true
         WHERE id = $1`,
        [user.id, 'google', googleId]
      );
      return user;
    }

    // No existing user found, create new one
    user = await this.db.one<UserRow>(
      'INSERT INTO users (email, phone, phone_verified, gender, dob, location, lat, lng, device_id, auth_provider, provider_subject, email_verified) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *',
      [
        email,
        null,
        true, // phone_verified - assume true for Google users
        null, // gender
        null, // dob
        null, // location
        null, // lat
        null, // lng
        null, // device_id
        'google',
        googleId,
        true  // email_verified
      ]
    );
    return user!;
  }

  /** Find a user by ID. Returns null if not found. */
  async findOne(userId: string): Promise<UserRow | null> {
    return this.db.oneOrNone<UserRow>('SELECT * FROM users WHERE id = $1', [userId]);
  }

  /** Find a user by ID. Throws if not found. */
  async findOneOrFail(userId: string): Promise<UserRow> {
    const user = await this.db.oneOrNone<UserRow>('SELECT * FROM users WHERE id = $1', [userId]);
    if (!user) {
      throw new Error('User not found');
    }
    return user!;
  }
}