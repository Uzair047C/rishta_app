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
  async requireOnboarded(): Promise<UserRow> {
    const user = await this.require();
    if (!user.gender) throw new ForbiddenException('profile_incomplete');
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
}
