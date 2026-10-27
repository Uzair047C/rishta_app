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

  /**
   * Find or create a user by Firebase UID.
   * Primary identifier is firebase_uid.
   * If no match but a user with the same verified email exists and has no firebase_uid, link it.
   * If that email is already linked to a different firebase_uid, return conflict.
   */
  async findOrCreateByFirebaseUid(
    firebaseUid: string,
    email: string,
    displayName?: string
  ): Promise<UserRow> {
    if (!email) {
      throw new Error('Email not provided from Firebase');
    }

    // First try to find by Firebase UID
    let user = await this.db.oneOrNone<UserRow>(
      'SELECT * FROM users WHERE firebase_uid = $1',
      [firebaseUid]
    );

    if (user) {
      // Update email_verified if Firebase says it's verified
      await this.db.query(
        'UPDATE users SET email_verified = true WHERE id = $1',
        [user.id]
      );
      return user;
    }

    // If no Firebase UID match, look for user with this email (lowercase for case-insensitive)
    const lowerEmail = email.toLowerCase();
    user = await this.db.oneOrNone<UserRow>(
      'SELECT * FROM users WHERE lower(email) = $1 AND email_verified = true',
      [lowerEmail]
    );

    if (user) {
      // Check if this user already has a firebase_uid
      if (user.firebase_uid && user.firebase_uid !== firebaseUid) {
        throw new Error('Account already exists with different Firebase UID');
      }
      // Link this Firebase account to the user
      await this.db.query(
        `UPDATE users SET
           firebase_uid = $2,
           email_verified = true
           WHERE id = $1`,
        [user.id, firebaseUid]
      );
      return user;
    }

    // No existing user found, create new one
    user = await this.db.one<UserRow>(
      `INSERT INTO users (email, phone, phone_verified, gender, dob, location, lat, lng, device_id, firebase_uid, email_verified)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
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
        firebaseUid,
        true,
      ]
    );
    return user!;
  }

  /**
   * @deprecated Use findOrCreateByFirebaseUid instead. Kept for backward compatibility.
   */
  async findOrCreateByGoogleId(
    googleId: string,
    email: string,
    firstName?: string,
    lastName?: string
  ): Promise<UserRow> {
    // Delegate to firebase method since Firebase UID is now the primary identifier
    return this.findOrCreateByFirebaseUid(googleId, email, `${firstName ?? ''} ${lastName ?? ''}`.trim() || undefined);
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