import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { Auth, Principal } from '../auth/auth';
import { UsersService } from '../users/users.service';
import { Db } from '../db/db';

class ReportDto {
  @IsUUID() reportedId!: string;
  @IsString() @MinLength(3) @MaxLength(500) reason!: string;
  @IsOptional() @IsUUID() matchId?: string;
  @IsOptional() @IsUUID() messageId?: string;
}

@Controller('reports')
export class ReportsController {
  constructor(
    private readonly db: Db,
    private readonly users: UsersService,
  ) {}

  /**
   * Spec 2.5 — reports feed the same human review queue as automated flags.
   * Reported but not blocked: the two actions stay independent (spec 1.2).
   */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post()
  async create(@Auth() principal: Principal, @Body() dto: ReportDto) {
    const user = await this.users.require(principal.uid);
    if (user.id === dto.reportedId) throw new BadRequestException('cannot_report_self');

    const report = await this.db.one(
      `INSERT INTO reports (reporter_id, reported_id, match_id, message_id, reason)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, status, created_at`,
      [user.id, dto.reportedId, dto.matchId ?? null, dto.messageId ?? null, dto.reason],
    );
    return { report };
  }
}
