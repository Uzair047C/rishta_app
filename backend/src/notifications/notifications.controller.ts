import { Body, Controller, Delete, Get, Post, Put } from '@nestjs/common';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { Auth, Principal } from '../auth/auth';
import { UsersService } from '../users/users.service';
import { Db } from '../db/db';

class PreferencesDto {
  @IsOptional() @IsBoolean() newLike?: boolean;
  @IsOptional() @IsBoolean() newMatch?: boolean;
  @IsOptional() @IsBoolean() newMessage?: boolean;
  @IsOptional() @IsBoolean() marketing?: boolean;
}

class DeviceDto {
  @IsString() @MaxLength(4096) token!: string;
  @IsIn(['android', 'ios', 'web']) platform!: 'android' | 'ios' | 'web';
}

/** camelCase API <-> snake_case column. Typed, so no name is built from input. */
const COLUMNS: Record<keyof PreferencesDto, string> = {
  newLike: 'new_like',
  newMatch: 'new_match',
  newMessage: 'new_message',
  marketing: 'marketing',
};

@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly db: Db,
    private readonly users: UsersService,
  ) {}

  /** Spec 1.2 — per-category toggles are expected by both app stores. */
  @Get('preferences')
  async get(@Auth() principal: Principal) {
    const user = await this.users.require(principal.uid);
    // Defaults live in the schema; a missing row means "never configured".
    const row = await this.db.one<Record<string, boolean>>(
      `INSERT INTO notification_preferences (user_id) VALUES ($1)
       ON CONFLICT (user_id) DO UPDATE SET user_id = EXCLUDED.user_id
       RETURNING *`,
      [user.id],
    );
    return {
      newLike: row?.new_like ?? true,
      newMatch: row?.new_match ?? true,
      newMessage: row?.new_message ?? true,
      marketing: row?.marketing ?? false,
    };
  }

  @Put('preferences')
  async update(@Auth() principal: Principal, @Body() dto: PreferencesDto) {
    const user = await this.users.require(principal.uid);
    const entries = Object.entries(dto).filter(([, v]) => v !== undefined);
    if (!entries.length) return this.get(principal);

    const assignments = entries.map(([k], i) => `${COLUMNS[k as keyof PreferencesDto]} = $${i + 2}`);
    const values = entries.map(([, v]) => v);

    await this.db.query(
      `INSERT INTO notification_preferences (user_id) VALUES ($1)
       ON CONFLICT (user_id) DO NOTHING`,
      [user.id],
    );
    await this.db.query(
      `UPDATE notification_preferences SET ${assignments.join(', ')} WHERE user_id = $1`,
      [user.id, ...values],
    );
    return this.get(principal);
  }

  /** Client calls this after FCM hands it a token. */
  @Post('device')
  async registerDevice(@Auth() principal: Principal, @Body() dto: DeviceDto) {
    const user = await this.users.require(principal.uid);
    // Token is the PK: a device that changes hands must move to the new owner.
    await this.db.query(
      `INSERT INTO device_tokens (token, user_id, platform) VALUES ($1, $2, $3)
       ON CONFLICT (token) DO UPDATE SET user_id = EXCLUDED.user_id, platform = EXCLUDED.platform`,
      [dto.token, user.id, dto.platform],
    );
    return { registered: true };
  }

  @Delete('device')
  async unregisterDevice(@Auth() principal: Principal, @Body() dto: DeviceDto) {
    const user = await this.users.require(principal.uid);
    await this.db.query('DELETE FROM device_tokens WHERE token = $1 AND user_id = $2', [
      dto.token,
      user.id,
    ]);
    return { registered: false };
  }
}
