import { ForbiddenException, Injectable } from '@nestjs/common';
import { Db } from '../db/db';
import { UserRow } from '../db/types';

@Injectable()
export class UsersService {
  constructor(private readonly db: Db) {}

  /** The caller's users row. Returns the first user or creates one. */
  async require(): Promise<UserRow> {
    let user = await this.db.oneOrNone<UserRow>('SELECT * FROM users LIMIT 1');
    if (!user) {
      user = await this.db.one<UserRow>(
        'INSERT INTO users (email, phone, phone_verified, gender, dob, location, lat, lng, device_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *',
        [null, null, false, null, null, null, null, null, null]
      );
    }
    return user!;
  }

  /** Same, but also rejects callers who have not finished onboarding. */
  async requireOnboarded(userId?: string): Promise<UserRow> {
    const user = userId
      ? await this.db.oneOrNone<UserRow>('SELECT * FROM users WHERE id = $1', [userId])
      : await this.require();

    if (!user) {
      throw new Error('User not found');
    }

    const profile = await this.db.oneOrNone('SELECT 1 FROM profiles WHERE user_id = $1', [user.id]);
    if (!profile) {
      throw new ForbiddenException('profile_incomplete');
    }
    return user;
  }

  /**
   * Idempotent provision. Safe to call on every app launch: returns the first user or creates one.
   */
  async provision(deviceId?: string): Promise<UserRow> {
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
   * Uses email as the unique identifier; creates a new user if none exists.
   */
  async findOrCreateByGoogleId(googleId: string, profileInfo: {
    email?: string;
    firstName?: string;
    lastName?: string;
  }): Promise<UserRow> {
    const email = profileInfo.email;
    if (!email) {
      throw new Error('Email not provided from Google');
    }

    let user = await this.db.oneOrNone<UserRow>('SELECT * FROM users WHERE email = $1', [email]);
    if (!user) {
      user = await this.db.one<UserRow>(
        'INSERT INTO users (email, phone, phone_verified, gender, dob, location, lat, lng, device_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *',
        [email, null, false, null, null, null, null, null, null]
      );
    }
    return user!;
  }
}