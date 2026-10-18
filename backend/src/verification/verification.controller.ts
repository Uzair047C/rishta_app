import { Body, Controller, Get, Post } from '@nestjs/common';
import { IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';
import { Public } from '../auth/public.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
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
  async livenessSession(@CurrentUser() userId: string) {
    const user = await this.users.require(userId);
    return this.verification.createLivenessSession();
  }

  /** Step 2 — server pulls the liveness result and face-matches it. */
  @Post('selfie')
  async selfie(@CurrentUser() userId: string, @Body() dto: SelfieDto) {
    const user = await this.users.require(userId);
    return this.verification.submit(user, dto.livenessSessionId, dto.selfieUrl);
  }

  /** Drives the pending/verified/failed screen. */
  @Get('status')
  async status(@CurrentUser() userId: string) {
    const user = await this.users.require(userId);
    return this.verification.status(user.id);
  }
}
