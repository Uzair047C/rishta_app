import { Body, Controller, Get, Post } from '@nestjs/common';
import { IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';
import { Public } from '../auth/public.decorator';
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
  @Public()
  @Post('liveness-session')
  async livenessSession() {
    await this.users.require();
    return this.verification.createLivenessSession();
  }

  /** Step 2 — server pulls the liveness result and face-matches it. */
  @Public()
  @Post('selfie')
  async selfie(@Body() dto: SelfieDto) {
    const user = await this.users.require();
    return this.verification.submit(user, dto.livenessSessionId, dto.selfieUrl);
  }

  /** Drives the pending/verified/failed screen. */
  @Public()
  @Get('status')
  async status() {
    const user = await this.users.require();
    return this.verification.status(user.id);
  }
}
