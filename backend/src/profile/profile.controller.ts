import { Body, Controller, Get, Post } from '@nestjs/common';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Auth, Principal } from '../auth/auth';
import { UsersService } from '../users/users.service';
import { ProfileInput, ProfileService } from './profile.service';
import { Gender, MaritalStatus } from '../db/types';

const GENDERS: Gender[] = ['male', 'female', 'other'];
const MARITAL: MaritalStatus[] = ['never_married', 'divorced', 'widowed'];

class ProfileDto implements ProfileInput {
  @IsString() @MinLength(1) @MaxLength(80) name!: string;

  @IsIn(GENDERS) gender!: Gender;

  /** Picker-supplied ISO date. Age itself is enforced server-side, see ProfileService. */
  @IsDateString() dob!: string;

  @IsOptional() @IsString() @MaxLength(120) location?: string;
  @IsOptional() @IsNumber() @Min(-90) @Max(90) lat?: number;
  @IsOptional() @IsNumber() @Min(-180) @Max(180) lng?: number;
  @IsOptional() @IsString() @MaxLength(1000) bio?: string;
  @IsOptional() @IsString() @MaxLength(120) education?: string;
  @IsOptional() @IsString() @MaxLength(120) profession?: string;
  @IsOptional() @IsIn(MARITAL) maritalStatus?: MaritalStatus;

  /** Fixed tag ids from GET /profile/interests — no free-text interests. */
  @IsOptional() @IsArray() @IsInt({ each: true }) interestIds?: number[];
  @IsOptional() @IsArray() @IsInt({ each: true }) languageIds?: number[];
}

class PhotoDto {
  @IsUrl({ require_tld: false }) url!: string;
  @IsOptional() @IsBoolean() makePrimary?: boolean;
}

@Controller('profile')
export class ProfileController {
  constructor(
    private readonly profiles: ProfileService,
    private readonly users: UsersService,
  ) {}

  /** Closed tag set — what makes interest-overlap ranking computable. */
  @Get('interests')
  async tags() {
    const [interests, languages] = await Promise.all([
      this.profiles.interests(),
      this.profiles.languages(),
    ]);
    return { interests, languages };
  }

  @Get()
  async me(@Auth() principal: Principal) {
    const user = await this.users.require(principal.uid);
    return this.profiles.me(user.id);
  }

  @Post()
  async save(@Auth() principal: Principal, @Body() dto: ProfileDto) {
    const user = await this.users.require(principal.uid);
    return this.profiles.upsert(user, dto);
  }

  @Post('photo')
  async addPhoto(@Auth() principal: Principal, @Body() dto: PhotoDto) {
    const user = await this.users.require(principal.uid);
    return this.profiles.addPhoto(user.id, dto.url, dto.makePrimary);
  }
}
