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
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Public } from '../auth/public.decorator';
import { UsersService } from '../users/users.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { ProfileInput, ProfileService } from './profile.service';
import { Gender, MaritalStatus, ReligiousPracticeLevel, Sect } from '../db/types';
import { PhotosService } from '../photos/photos.service';

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
  @IsString() @MaxLength(512) objectPath!: string; // e.g., "photos/user-uuid/photo1.jpg"
  @IsOptional() @IsBoolean() makePrimary?: boolean;
}

class SetPhotosDto {
  @IsArray() @IsString({ each: true }) @MaxLength(512, { each: true }) objectPaths!: string[];
}

@Controller('profile')
export class ProfileController {
  constructor(
    private readonly profiles: ProfileService,
    private readonly users: UsersService,
    private readonly photos: PhotosService,
  ) {}

  /** Closed tag set — what makes interest-overlap ranking computable. */
  @Get('interests')
  async tags() {
    const [interests, languages] = await Promise.all([
      this.profiles.interests(),
      this.profiles.languages(),
    ]);
    const categorized = await this.profiles.interestsCategorized();
    return { interests, languages, categorized };
  }

  @Public()
  @Get('interest-categories')
  async interestCategories() {
    const categories = await this.profiles.interestsCategorized();
    return { categories };
  }

  @Public()
  @Get('personality-categories')
  personalityTraitsCategorized() {
    const categories = this.profiles.personalityTraitsCategorized();
    return { categories };
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
  async me(@CurrentUser() userId: string) {
    return this.profiles.me(userId);
  }

  @Post()
  async save(@CurrentUser() userId: string, @Body() dto: ProfileDto) {
    return this.profiles.upsert(userId, dto);
  }

  @Post('photo')
  async addPhoto(@CurrentUser() userId: string, @Body() dto: PhotoDto) {
    return this.photos.addPhoto({ userId, objectPath: dto.objectPath, makePrimary: dto.makePrimary });
  }

  @Post('photos')
  async setPhotos(@CurrentUser() userId: string, @Body() dto: SetPhotosDto) {
    return this.photos.setPhotos(userId, dto.objectPaths);
  }
}

