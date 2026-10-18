import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { Public } from '../auth/public.decorator';
import { UsersService } from '../users/users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { FeedFilters, FeedService } from './feed.service';

class FeedQuery implements FeedFilters {
  @IsOptional() @Type(() => Number) @IsInt() @Min(18) @Max(120) minAge?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(18) @Max(120) maxAge?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(20000) radiusKm?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset?: number;
}

class TargetDto {
  @IsUUID() userId!: string;
}

class BlockDto extends TargetDto {
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

@Controller('feed')
export class FeedController {
  constructor(
    private readonly feed: FeedService,
    private readonly users: UsersService,
  ) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  async list(@CurrentUser() userId: string, @Query() query: FeedQuery) {
    return { candidates: await this.feed.feed(userId, query) };
  }

  /** Stricter limit than the global default — this is a write with a quota. */
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('like')
  @UseGuards(JwtAuthGuard)
  async like(@CurrentUser() userId: string, @Body() dto: TargetDto) {
    return this.feed.like(userId, dto.userId);
  }

  @Post('pass')
  @UseGuards(JwtAuthGuard)
  async pass(@CurrentUser() userId: string, @Body() dto: TargetDto) {
    return this.feed.pass(userId, dto.userId);
  }

  @Post('block')
  @UseGuards(JwtAuthGuard)
  async block(@CurrentUser() userId: string, @Body() dto: BlockDto) {
    return this.feed.block(userId, dto.userId, dto.reason);
  }
}
