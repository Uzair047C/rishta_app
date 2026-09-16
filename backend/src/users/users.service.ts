import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Db } from '../db/db';
import { UserRow } from '../db/types';
import { Principal } from '../auth/auth';

/** ponytail: flat cap. Move to a per-device risk score if abuse shows up. */
const MAX_ACCOUNTS_PER_DEVICE = 3;

@Injectable()
export class UsersService {
  constructor(private readonly db: Db) {}

  /** The caller's users row, or 401 if they never completed POST /auth/verify-token. */
  async require(uid: string): Promise<UserRow> {
    const user = await this.db.one<UserRow>('SELECT * FROM users WHERE firebase_uid = $1', [uid]);
    if (!user) throw new UnauthorizedException('not_registered');
    return user;
  }

  /** Same, but also rejects callers who have not finished onboarding. */
  async requireOnboarded(uid: string): Promise<UserRow> {
    const user = await this.require(uid);
    if (!user.gender) throw new ForbiddenException('profile_incomplete');
    return user;
  }

  /**
   * Idempotent signup. Safe to call on every app launch: an existing
   * firebase_uid is returned untouched rather than duplicated.
   */
  async provision(principal: Principal, deviceId?: string): Promise<UserRow> {
    const existing = await this.db.one<UserRow>(
      'SELECT * FROM users WHERE firebase_uid = $1',
      [principal.uid],
    );
    if (existing) return existing;

    if (deviceId) await this.assertDeviceHasRoom(deviceId);

    const inserted = await this.db.one<UserRow>(
      `INSERT INTO users (firebase_uid, email, phone, phone_verified, device_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (firebase_uid) DO NOTHING
       RETURNING *`,
      [principal.uid, principal.email, principal.phone, Boolean(principal.phone), deviceId ?? null],
    );
    // Lost an insert race with a concurrent launch — the winner's row is fine.
    return inserted ?? this.require(principal.uid);
  }

  private async assertDeviceHasRoom(deviceId: string): Promise<void> {
    const { n } = (
      await this.db.query('SELECT count(*)::int AS n FROM users WHERE device_id = $1', [deviceId])
    ).rows[0] as { n: number };
    if (n >= MAX_ACCOUNTS_PER_DEVICE) {
      throw new ForbiddenException('device_account_limit_reached');
    }
  }
}
