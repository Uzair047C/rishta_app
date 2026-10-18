import {
  Body,
  CanActivate,
  Controller,
  ExecutionContext,
  ForbiddenException,
  Get,
  Headers,
  Injectable,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { Public } from '../auth/public.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { UsersService } from '../users/users.service';
import { Db } from '../db/db';
import * as crypto from 'crypto';

const QUEUE_STATUSES = ['open', 'reviewing', 'actioned', 'dismissed'] as const;

class QueueQuery {
  @IsOptional() @IsIn(QUEUE_STATUSES) status: string = 'open';
  @IsOptional() @Type(() => Number) limit: number = 50;
}

class QueueActionDto {
  @IsIn(QUEUE_STATUSES) status!: string;
  @IsOptional() @IsString() note?: string;
}

/**
 * Minimal admin gate. Uses an admin token from env (ADMIN_TOKEN) passed in
 * Authorization header. Move to a role table when there is more than one kind of admin.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const allowed = (process.env.ADMIN_TOKEN ?? '').trim();
    if (!allowed) throw new ForbiddenException('admin_only');
    const authHeader = ctx.switchToHttp().getRequest().headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new ForbiddenException('admin_only');
    }
    const provided = authHeader.substring(7);
    // Timing-safe comparison
    if (provided.length !== allowed.length || !crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(allowed))) {
      throw new ForbiddenException('admin_only');
    }
    return true;
  }
}

/** Spec 2.6 step 8 — the human review interface over the flagging pipeline. */
@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(
    private readonly db: Db,
    private readonly users: UsersService,
  ) {}

  /** Submissions flagged by the automated screeners, oldest first. */
  @Get('flags')
  async flags(@Query() query: QueueQuery) {
    const flags = await this.db.all(
      `SELECT f.*, u.email AS user_email
         FROM moderation_flags f
         LEFT JOIN users u ON u.id = f.user_id
        WHERE f.status = $1
        ORDER BY f.created_at ASC
        LIMIT $2`,
      [query.status, Math.min(query.limit, 200)],
    );
    return { flags };
  }

  /** Reports filed by users. */
  @Get('reports')
  async reports(@Query() query: QueueQuery) {
    const reports = await this.db.all(
      `SELECT r.*, reporter.email AS reporter_email, reported.email AS reported_email
         FROM reports r
         LEFT JOIN users reporter ON reporter.id = r.reporter_id
         LEFT JOIN users reported ON reported.id = r.reported_id
        WHERE r.status = $1
        ORDER BY r.created_at ASC
        LIMIT $2`,
      [query.status, Math.min(query.limit, 200)],
    );
    return { reports };
  }

  @Patch('flags/:id')
  async resolveFlag(@Param('id', ParseUUIDPipe) id: string, @Body() dto: QueueActionDto) {
    await this.db.query('UPDATE moderation_flags SET status = $2 WHERE id = $1', [id, dto.status]);
    return { id, status: dto.status };
  }

  @Patch('reports/:id')
  async resolveReport(@Param('id', ParseUUIDPipe) id: string, @Body() dto: QueueActionDto) {
    await this.db.query('UPDATE reports SET status = $2 WHERE id = $1', [id, dto.status]);
    return { id, status: dto.status };
  }

  /** Reviewers are users too, so the id is resolved the same way. */
  @Get('whoami')
  async whoami(@CurrentUser() userId: string) {
    return { userId };
  }
}
