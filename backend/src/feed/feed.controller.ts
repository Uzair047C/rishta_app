import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { Public } from '../auth/public.decorator';
import { UsersService } from '../users/users.service';
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
  async list(@Query() query: FeedQuery) {
    const user = await this.users.requireOnboarded();
    return { candidates: await this.feed.feed(user, query) };
  }

  /** Stricter limit than the global default — this is a write with a quota. */
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Public()
  @Post('like')
  async like(@Body() dto: TargetDto) {
    const user = await this.users.require();
    return this.feed.like(user, dto.userId);
  }

  @Public()
  @Post('pass')
  async pass(@Body() dto: TargetDto) {
    const user = await this.users.require();
    return this.feed.pass(user, dto.userId);
  }

  @Public()
  @Post('block')
  async block(@Body() dto: BlockDto) {
    const user = await this.users.require();
    return this.feed.block(user, dto.userId, dto.reason);
  }
}
