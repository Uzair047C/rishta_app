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
import { Auth, Principal, Public } from '../auth/auth';
import { UsersService } from '../users/users.service';
import { ProfileInput, ProfileService } from './profile.service';
import { Gender, MaritalStatus, ReligiousPracticeLevel, Sect } from '../db/types';

const GENDERS: Gender[] = ['male', 'female', 'other'];
const MARITAL: MaritalStatus[] = ['never_married', 'divorced', 'separated', 'annulled', 'widowed', 'married'];
const SECTS: Sect[] = ['sunni', 'shia', 'other', 'prefer_not_to_say'];
const PRACTICE: ReligiousPracticeLevel[] = ['strictly', 'actively', 'occasionally', 'not_practising'];

class ProfileDto implements ProfileInput {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(80) name?: string;

  @IsOptional() @IsIn(GENDERS) gender?: Gender;

  /** Picker-supplied ISO date. Age itself is enforced server-side, see ProfileService. */
  @IsOptional() @IsDateString() dob?: string;

  @IsOptional() @IsString() @MaxLength(120) location?: string;
  @IsOptional() @IsNumber() @Min(-90) @Max(90) lat?: number;
  @IsOptional() @IsNumber() @Min(-180) @Max(180) lng?: number;
  @IsOptional() @IsString() @MaxLength(1000) bio?: string;
  @IsOptional() @IsString() @MaxLength(120) education?: string;
  @IsOptional() @IsString() @MaxLength(120) profession?: string;
  @IsOptional() @IsIn(SECTS) sect?: Sect;
  @IsOptional() @IsString() @MaxLength(120) nationality?: string;
  @IsOptional() @IsString() @MaxLength(120) ethnicity?: string;
  @IsOptional() @IsIn(MARITAL) maritalStatus?: MaritalStatus;
  @IsOptional() @IsString() @MaxLength(60) relationshipTimelineIntent?: string;
  @IsOptional() @IsString() @MaxLength(60) marriageTimelineIntent?: string;
  @IsOptional() @IsIn(PRACTICE) religiousPracticeLevel?: ReligiousPracticeLevel;
  @IsOptional() @IsBoolean() drinksAlcohol?: boolean;
  @IsOptional() @IsBoolean() wouldMoveAbroad?: boolean;
  @IsOptional() @IsArray() @IsString({ each: true }) personalityTraits?: string[];

  /** Fixed tag ids from GET /profile/interests — no free-text interests. */
  @IsOptional() @IsArray() @IsInt({ each: true }) interestIds?: number[];
  @IsOptional() @IsArray() @IsInt({ each: true }) languageIds?: number[];
}

class PhotoDto {
  @IsUrl({ require_tld: false }) url!: string;
  @IsOptional() @IsBoolean() makePrimary?: boolean;
}

class SetPhotosDto {
  @IsArray() @IsUrl({ require_tld: false }, { each: true }) urls!: string[];
}

@Controller('profile')
export class ProfileController {
  constructor(
    private readonly profiles: ProfileService,
    private readonly users: UsersService,
  ) {}

  /** Closed tag set — what makes interest-overlap ranking computable. */
  @Public()
  @Get('interests')
  async tags() {
    const [interests, languages] = await Promise.all([
      this.profiles.interests(),
      this.profiles.languages(),
    ]);
    const categorized = this.profiles.interestsCategorized();
    return { interests, languages, categorized };
  }

  @Public()
  @Get('professions')
  professions() {
    return this.profiles.professions();
  }

  @Public()
  @Get('nationalities')
  nationalities() {
    return this.profiles.nationalities();
  }

  @Public()
  @Get('ethnicities')
  ethnicities() {
    return this.profiles.ethnicities();
  }

  @Public()
  @Get('personality-traits')
  personalityTraits() {
    return this.profiles.personalityTraits();
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

  @Post('photos')
  async setPhotos(@Auth() principal: Principal, @Body() dto: SetPhotosDto) {
    const user = await this.users.require(principal.uid);
    return this.profiles.setPhotos(user.id, dto.urls);
  }
}

