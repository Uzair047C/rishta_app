import { Body, CanActivate, Controller, ExecutionContext, ForbiddenException, Get, Injectable, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { Reflector } from '@nestjs/core';
import { CurrentUser } from '../auth/current-user.decorator';
import { Db } from '../db/db';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import * as crypto from 'crypto';

const QUEUE_STATUSES = ['open', 'reviewing', 'actioned', 'dismissed'] as const;
const USER_STATUSES = ['active', 'suspended', 'banned'] as const;

class QueueQuery {
  @IsOptional() @IsIn(QUEUE_STATUSES) status: string = 'open';
  @IsOptional() @Type(() => Number) limit: number = 50;
}

class QueueActionDto {
  @IsIn(QUEUE_STATUSES) status!: string;
  @IsOptional() @IsString() note?: string;
}

class UserActionDto {
  @IsIn(USER_STATUSES) status!: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

/**
 * Admin guard: checks if the authenticated user is an admin.
 * Supports two modes:
 * 1. ADMIN_USER_IDS (preferred) - comma-separated list of user UUIDs with admin role
 * 2. ADMIN_TOKEN - static token compared with timing-safe comparison
 */
@Injectable()
export class AdminGuard implements CanActivate {
  private readonly adminUserIds: Set<string>;
  private readonly adminToken: string | null;

  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
  ) {
    // Parse ADMIN_USER_IDS (comma-separated UUIDs)
    const adminUserIdsStr = this.config.get<string>('ADMIN_USER_IDS') ?? '';
    this.adminUserIds = new Set(
      adminUserIdsStr.split(',').map(s => s.trim()).filter(Boolean)
    );

    // Get ADMIN_TOKEN for timing-safe comparison
    this.adminToken = this.config.get<string>('ADMIN_TOKEN') ?? null;
  }

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;

    // Check ADMIN_USER_IDS first (preferred)
    if (user?.id && this.adminUserIds.has(user.id)) {
      return true;
    }

    // Fallback: check ADMIN_TOKEN with timing-safe comparison
    if (this.adminToken) {
      const providedToken = request.headers['x-admin-token'] as string | undefined;
      if (providedToken) {
        const providedBuf = Buffer.from(providedToken);
        const expectedBuf = Buffer.from(this.adminToken);
        if (providedBuf.length === expectedBuf.length && crypto.timingSafeEqual(providedBuf, expectedBuf)) {
          return true;
        }
      }
    }

    // Fallback: check is_admin flag on user (legacy)
    if (user?.is_admin) {
      return true;
    }

    throw new ForbiddenException('admin_only');
  }
}

/** Spec 2.6 step 8 — the human review interface over the flagging pipeline. */
@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminController {
  constructor(
    private readonly db: Db,
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
  async resolveFlag(@Param('id', ParseUUIDPipe) id: string, @Body() dto: QueueActionDto, @CurrentUser() userId: string) {
    await this.db.tx(async (conn) => {
      await conn.query(
        'UPDATE moderation_flags SET status = $2, reviewed_by = $3, reviewed_at = now() WHERE id = $1',
        [id, dto.status, userId]
      );
      // Audit log
      await conn.query(
        `INSERT INTO admin_audit_log (admin_id, action, target_type, target_id, details)
         VALUES ($1, $2, $3, $4, $5)`,
        [userId, 'resolve_flag', 'moderation_flag', id, JSON.stringify({ status: dto.status, note: dto.note })]
      );
    });
    return { id, status: dto.status };
  }

  @Patch('reports/:id')
  async resolveReport(@Param('id', ParseUUIDPipe) id: string, @Body() dto: QueueActionDto, @CurrentUser() userId: string) {
    await this.db.tx(async (conn) => {
      await conn.query(
        'UPDATE reports SET status = $2, resolved_by = $3, resolved_at = now() WHERE id = $1',
        [id, dto.status, userId]
      );
      // Audit log
      await conn.query(
        `INSERT INTO admin_audit_log (admin_id, action, target_type, target_id, details)
         VALUES ($1, $2, $3, $4, $5)`,
        [userId, 'resolve_report', 'report', id, JSON.stringify({ status: dto.status, note: dto.note })]
      );
    });
    return { id, status: dto.status };
  }

  /** Admin: suspend or ban a user. */
  @Post('users/:id/status')
  async setUserStatus(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UserActionDto, @CurrentUser() adminId: string) {
    const result = await this.db.tx(async (conn) => {
      const updated = await conn.query(
        `UPDATE users SET status = $2 WHERE id = $1 RETURNING id, status`,
        [id, dto.status]
      );
      if (!updated.rowCount) {
        throw new ForbiddenException('user_not_found');
      }
      // Audit log
      await conn.query(
        `INSERT INTO admin_audit_log (admin_id, action, target_type, target_id, details)
         VALUES ($1, $2, $3, $4, $5)`,
        [adminId, 'set_user_status', 'user', id, JSON.stringify({ status: dto.status, note: dto.note })]
      );
      return updated.rows[0];
    });
    return { user: result };
  }

  /** Admin: view audit log. */
  @Get('audit-log')
  async auditLog(@Query() query: QueueQuery) {
    const logs = await this.db.all(
      `SELECT a.*, u.email AS admin_email
         FROM admin_audit_log a
         LEFT JOIN users u ON u.id = a.admin_id
        ORDER BY a.created_at DESC
        LIMIT $1`,
      [Math.min(query.limit, 200)],
    );
    return { logs };
  }

  /** Reviewers are users too, so the id is resolved the same way. */
  @Get('whoami')
  async whoami(@CurrentUser() userId: string) {
    return { userId };
  }
}