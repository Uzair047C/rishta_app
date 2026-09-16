import { Body, Controller, Get, Post } from '@nestjs/common';
import { IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';
import { Auth, Principal } from '../auth/auth';
import { UsersService } from '../users/users.service';
import { VerificationService } from './verification.service';

class SelfieDto {
  /** Session from POST /verification/liveness-session, recorded by the client SDK. */
  @IsOptional() @IsString() @MaxLength(256) livenessSessionId?: string;
  /** Only used by the development passthrough; ignored in production. */
  @IsOptional() @IsUrl({ require_tld: false }) selfieUrl?: string;
}

@Controller('verification')
export class VerificationController {
  constructor(
    private readonly verification: VerificationService,
    private readonly users: UsersService,
  ) {}

  /** Step 1 — client records a liveness video into this session. */
  @Post('liveness-session')
  async livenessSession(@Auth() principal: Principal) {
    await this.users.requireOnboarded(principal.uid);
    return this.verification.createLivenessSession();
  }

  /** Step 2 — server pulls the liveness result and face-matches it. */
  @Post('selfie')
  async selfie(@Auth() principal: Principal, @Body() dto: SelfieDto) {
    const user = await this.users.requireOnboarded(principal.uid);
    return this.verification.submit(user, dto.livenessSessionId, dto.selfieUrl);
  }

  /** Drives the pending/verified/failed screen. */
  @Get('status')
  async status(@Auth() principal: Principal) {
    const user = await this.users.require(principal.uid);
    return this.verification.status(user.id);
  }
}
