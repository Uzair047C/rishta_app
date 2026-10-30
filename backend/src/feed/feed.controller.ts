import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { CurrentUser } from '../auth/current-user.decorator';
import { FeedFilters, FeedResult, FeedService } from './feed.service';

class CursorDto {
  @IsInt() shared_interests!: number;
  @IsOptional() @IsInt() distance_km?: number | null;
  @IsString() user_id!: string;
}

class FeedQuery implements FeedFilters {
  @IsOptional() @Type(() => Number) @IsInt() @Min(18) @Max(120) minAge?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(18) @Max(120) maxAge?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(20000) radiusKm?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit?: number;
  @IsOptional() @IsString() cursor?: string; // Opaque base64-encoded cursor
  @IsOptional() @IsString() religiousPracticeLevel?: string;
  @IsOptional() @IsString() sect?: string;
  @IsOptional() @IsString() maritalStatus?: string;
  @IsOptional() @IsString() education?: string;
  @IsOptional() @IsString() city?: string;
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
  ) {}

  @Get()
  async list(@CurrentUser() userId: string, @Query() query: FeedQuery) {
    const result = await this.feed.feed(userId, query);
    return { candidates: result.items, nextCursor: result.nextCursor };
  }

  /** Stricter limit than the global default — this is a write with a quota. */
  // like 60/min/user
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Post('like')
  async like(@CurrentUser() userId: string, @Body() dto: TargetDto) {
    return this.feed.like(userId, dto.userId);
  }

  @Post('pass')
  async pass(@CurrentUser() userId: string, @Body() dto: TargetDto) {
    return this.feed.pass(userId, dto.userId);
  }

  @Post('block')
  async block(@CurrentUser() userId: string, @Body() dto: BlockDto) {
    return this.feed.block(userId, dto.userId, dto.reason);
  }
}