import { Body, Controller, Get, Post, Param, ForbiddenException } from '@nestjs/common';
import { IsString, MaxLength } from 'class-validator';
import { CurrentUser } from '../auth/current-user.decorator';
import { UsersService } from '../users/users.service';
import { VerificationService } from './verification.service';

class SelfieDto {
  /** Selfie URL from client upload. */
  @IsString() @MaxLength(2048) selfieUrl!: string;
}

class AdminActionDto {
  @IsString() @MaxLength(500) reason!: string;
}

@Controller('verification')
export class VerificationController {
  constructor(
    private readonly verification: VerificationService,
    private readonly users: UsersService,
  ) {}

  /** Submit selfie for verification. Returns pending status. */
  @Post('selfie')
  async selfie(@CurrentUser() userId: string, @Body() dto: SelfieDto) {
    const user = await this.users.require(userId);
    return this.verification.submit(user, undefined, dto.selfieUrl);
  }

  /** Drives the pending/verified/failed screen. */
  @Get('status')
  async status(@CurrentUser() userId: string) {
    const user = await this.users.require(userId);
    return this.verification.status(user.id);
  }

  /** Admin: approve a pending verification. */
  @Post('admin/approve/:userId')
  async adminApprove(@CurrentUser() adminId: string, @Param('userId') userId: string) {
    const admin = await this.users.require(adminId);
    if (!admin.is_admin) throw new ForbiddenException('admin_only');
    return this.verification.approve(userId, adminId);
  }

  /** Admin: reject a pending verification. */
  @Post('admin/reject/:userId')
  async adminReject(@CurrentUser() adminId: string, @Param('userId') userId: string, @Body() dto: AdminActionDto) {
    const admin = await this.users.require(adminId);
    if (!admin.is_admin) throw new ForbiddenException('admin_only');
    return this.verification.reject(userId, adminId, dto.reason);
  }
}