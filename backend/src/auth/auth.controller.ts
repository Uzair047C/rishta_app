import { Body, ConflictException, Controller, Get, Post } from '@nestjs/common';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { Auth, Principal, Public } from './auth';
import { UsersService } from '../users/users.service';
import { Db } from '../db/db';
import { streamToken } from './stream-token';

class VerifyTokenDto {
  /** Firebase App Check / device fingerprint — second layer against multi-accounting. */
  @IsOptional() @IsString() @MaxLength(128) deviceId?: string;
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly users: UsersService,
    private readonly db: Db,
  ) {}

  /**
   * Exchanges a verified Firebase ID token for an app session (i.e. a users row).
   * Idempotent — the client calls it on every cold start.
   */
  @Post('verify-token')
  async verifyToken(@Auth() principal: Principal, @Body() dto: VerifyTokenDto) {
    const user = await this.users.provision(principal, dto.deviceId);
    return {
      user,
      onboarding: {
        profileComplete: Boolean(user.gender),
        verificationRequired: true,
      },
    };
  }

  /**
   * Confirms phone OTP. The number is read from the *verified token*, never from
   * the request body — otherwise a caller could claim any number and the unique
   * index would be the only thing standing between them and someone's account.
   */
  @Post('phone/verify')
  async phoneVerify(@Auth() principal: Principal) {
    if (!principal.phone) return { phoneVerified: false, reason: 'token_has_no_phone_number' };
    const user = await this.users.require(principal.uid);
    try {
      const updated = await this.db.one(
        `UPDATE users SET phone = $2, phone_verified = true
         WHERE id = $1 RETURNING id, phone, phone_verified`,
        [user.id, principal.phone],
      );
      return { phoneVerified: true, user: updated };
    } catch (err) {
      // Unique violation on users_phone_verified_uniq -> spec 2.3 duplicate accounts.
      if ((err as { code?: string }).code === '23505') {
        throw new ConflictException('phone_already_registered');
      }
      throw err;
    }
  }

  /** Short-lived Stream Chat token, issued only after Firebase auth succeeds (spec 2.1). */
  @Get('stream-token')
  async streamToken(@Auth() principal: Principal) {
    const user = await this.users.require(principal.uid);
    return { token: streamToken(user.id) };
  }

  @Public()
  @Get('health')
  health() {
    return { ok: true };
  }
}
