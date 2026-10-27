import { BadRequestException, Injectable } from '@nestjs/common';
import { Db } from '../db/db';
import { MaritalStatus, ProfileRow, ReligiousPracticeLevel, Sect, TagRow, UserRow } from '../db/types';
import { ModerationService } from '../moderation/moderation.service';
import { VerificationService } from '../verification/verification.service';

const MAX_PHOTOS = 6;

export interface ProfileInput {
  name?: string;
  gender?: 'male' | 'female' | 'other';
  dob?: string;
  location?: string;
  lat?: number;
  lng?: number;
  bio?: string;
  education?: string;
  profession?: string;
  sect?: Sect;
  nationality?: string;
  ethnicity?: string;
  maritalStatus?: MaritalStatus;
  relationshipTimelineIntent?: string;
  marriageTimelineIntent?: string;
  religiousPracticeLevel?: ReligiousPracticeLevel;
  drinksAlcohol?: boolean;
  wouldMoveAbroad?: boolean;
  personalityTraits?: string[];
  interestIds?: number[];
  languageIds?: number[];
}

// Fields that are immutable after onboarding completes
const IMMUTABLE_AFTER_ONBOARDING = ['gender', 'dob'] as const;

@Injectable()
export class ProfileService {
  constructor(
    private readonly db: Db,
    private readonly moderation: ModerationService,
    private readonly verification: VerificationService,
  ) {}

  interests(): Promise<TagRow[]> {
    return this.db.repo<TagRow>('interests').all('SELECT id, label FROM interests ORDER BY label');
  }

  languages(): Promise<TagRow[]> {
    return this.db.repo<TagRow>('languages').all('SELECT id, label FROM languages ORDER BY label');
  }

  professions(): { suggested: string[]; all: string[] } {
    const suggested = [
      'Accountant',
      'Civil Engineer',
      'Data Scientist',
      'Defense Employee',
      'Dentist',
      'Dentistry Employee',
      'Doctor',
      'Software Engineer',
      'Teacher',
    ];
    const all = [
      'Accountant',
      'Actor',
      'Architect',
      'Artist',
      'Banker',
      'Business Analyst',
      'Civil Engineer',
      'Consultant',
      'Data Analyst',
      'Data Scientist',
      'Defense Employee',
      'Dentist',
      'Dentistry Employee',
      'Designer',
      'Doctor',
      'Electrical Engineer',
      'Entrepreneur',
      'Finance Manager',
      'Graphic Designer',
      'HR Specialist',
      'Healthcare Worker',
      'Journalist',
      'Lawyer',
      'Manager',
      'Marketing Specialist',
      'Mechanical Engineer',
      'Nurse',
      'Pharmacist',
      'Photographer',
      'Pilot',
      'Product Manager',
      'Professor',
      'Real Estate Agent',
      'Researcher',
      'Sales Executive',
      'Scientist',
      'Software Engineer',
      'Student',
      'Teacher',
      'Veterinarian',
      'Writer',
      'Other',
    ];
    return { suggested, all };
  }

  nationalities(): { suggested: { name: string; code: string; flag: string }[]; all: { name: string; code: string; flag: string }[] } {
    const suggested = [
      { name: 'Pakistani', code: 'PK', flag: '🇵🇰' },
      { name: 'British', code: 'GB', flag: '🇬🇧' },
      { name: 'American', code: 'US', flag: '🇺🇸' },
      { name: 'Canadian', code: 'CA', flag: '🇨🇦' },
      { name: 'Emirati', code: 'AE', flag: '🇦🇪' },
      { name: 'Saudi', code: 'SA', flag: '🇸🇦' },
    ];

    const all = [
      { name: 'Afghan', code: 'AF', flag: '🇦🇫' },
      { name: 'Albanian', code: 'AL', flag: '🇦🇱' },
      { name: 'Algerian', code: 'DZ', flag: '🇩🇿' },
      { name: 'American', code: 'US', flag: '🇺🇸' },
      { name: 'Australian', code: 'AU', flag: '🇦🇺' },
      { name: 'Austrian', code: 'AT', flag: '🇦🇹' },
      { name: 'Bahraini', code: 'BH', flag: '🇧🇭' },
      { name: 'Bangladeshi', code: 'BD', flag: '🇧🇩' },
      { name: 'Belgian', code: 'BE', flag: '🇧🇪' },
      { name: 'Bosnian', code: 'BA', flag: '🇧🇦' },
      { name: 'British', code: 'GB', flag: '🇬🇧' },
      { name: 'Canadian', code: 'CA', flag: '🇨🇦' },
      { name: 'Chinese', code: 'CN', flag: '🇨🇳' },
      { name: 'Danish', code: 'DK', flag: '🇩🇰' },
      { name: 'Dutch', code: 'NL', flag: '🇳🇱' },
      { name: 'Egyptian', code: 'EG', flag: '🇪🇬' },
      { name: 'Emirati', code: 'AE', flag: '🇦🇪' },
      { name: 'Filipino', code: 'PH', flag: '🇵🇭' },
      { name: 'French', code: 'FR', flag: '🇫🇷' },
      { name: 'German', code: 'DE', flag: '🇩🇪' },
      { name: 'Ghanaian', code: 'GH', flag: '🇬🇭' },
      { name: 'Greek', code: 'GR', flag: '🇬🇷' },
      { name: 'Indian', code: 'IN', flag: '🇮🇳' },
      { name: 'Indonesian', code: 'ID', flag: '🇮🇩' },
      { name: 'Iranian', code: 'IR', flag: '🇮🇷' },
      { name: 'Iraqi', code: 'IQ', flag: '🇮🇶' },
      { name: 'Irish', code: 'IE', flag: '🇮🇪' },
      { name: 'Italian', code: 'IT', flag: '🇮🇹' },
      { name: 'Jordanian', code: 'JO', flag: '🇯🇴' },
      { name: 'Kenyan', code: 'KE', flag: '🇰🇪' },
      { name: 'Kuwaiti', code: 'KW', flag: '🇰🇼' },
      { name: 'Lebanese', code: 'LB', flag: '🇱🇧' },
      { name: 'Libyan', code: 'LY', flag: '🇱🇾' },
      { name: 'Malaysian', code: 'MY', flag: '🇲🇾' },
      { name: 'Morocan', code: 'MA', flag: '🇲🇦' },
      { name: 'Nigerian', code: 'NG', flag: '🇳🇬' },
      { name: 'Norwegian', code: 'NO', flag: '🇳🇴' },
      { name: 'Omani', code: 'OM', flag: '🇴🇲' },
      { name: 'Pakistani', code: 'PK', flag: '🇵🇰' },
      { name: 'Palestinian', code: 'PS', flag: '🇵🇸' },
      { name: 'Qatari', code: 'QA', flag: '🇶🇦' },
      { name: 'Saudi', code: 'SA', flag: '🇸🇦' },
      { name: 'Singaporean', code: 'SG', flag: '🇸🇬' },
      { name: 'Somali', code: 'SO', flag: '🇸🇴' },
      { name: 'South African', code: 'ZA', flag: '🇿🇦' },
      { name: 'Spanish', code: 'ES', flag: '🇪🇸' },
      { name: 'Sudanese', code: 'SD', flag: '🇸🇩' },
      { name: 'Swedish', code: 'SE', flag: '🇸🇪' },
      { name: 'Swiss', code: 'CH', flag: '🇨🇭' },
      { name: 'Syrian', code: 'SY', flag: '🇸🇾' },
      { name: 'Tunisian', code: 'TN', flag: '🇹🇳' },
      { name: 'Turkish', code: 'TR', flag: '🇹🇷' },
      { name: 'Yemeni', code: 'YE', flag: '🇾🇪' },
      { name: 'Other', code: 'XX', flag: '🌍' },
    ];
    return { suggested, all };
  }

  ethnicities(): { suggested: string[]; all: string[] } {
    const suggested = [
      'Baloch',
      'Bangladeshi',
      'Gujarati',
      'Hazara',
      'Pakistani',
      'Pashtun',
      'Punjabi',
      'Sindhi',
    ];
    const all = [
      'Afghan',
      'African American',
      'Arab',
      'Baloch',
      'Bangladeshi',
      'Bengali',
      'Berber',
      'Black African',
      'Caribbean',
      'Central Asian',
      'East African',
      'Egyptian',
      'Filipino',
      'Gujarati',
      'Hazara',
      'Indian',
      'Indonesian',
      'Iranian / Persian',
      'Iraqi',
      'Kashmiri',
      'Kurdish',
      'Levantine Arab',
      'Malay',
      'Muhajir',
      'North African',
      'Pakistani',
      'Pashtun',
      'Punjabi',
      'Saraiki',
      'Sindhi',
      'Somali',
      'South Asian',
      'Sudanese',
      'Turkish',
      'West African',
      'White / Caucasian',
      'Other',
    ];
    return { suggested, all };
  }

  personalityTraits(): { traits: string[]; mbti: string[] } {
    const traits = [
      'Active Listener',
      'Adventurous',
      'Affectionate',
      'Ambitious',
      'Animal Lover',
      'Bookworm',
      'Brunch Lover',
      'Calm',
      'Career-driven',
      'Carefree',
      'Charismatic',
      'Cheerful',
      'Competitive',
      'Confident',
      'Conservative',
      'Creative',
      'Cultural',
      'Empathetic',
      'Entrepreneurial',
      'Extrovert',
      'Family-oriented',
      'Generous',
      'Genuine',
      'Good with Kids',
      'Intelligent',
      'Introverted',
      'Liberal',
      'Nerdy',
      'Open-minded',
      'Outgoing',
      'Patient',
      'Playful',
      'Positive',
      'Religious',
      'Respectful',
      'Romantic',
      'Self-aware',
      'Shy',
      'Spontaneous',
      'Thoughtful',
    ];
    const mbti = [
      'ENFJ',
      'ENFP',
      'ENTJ',
      'ENTP',
      'ESFJ',
      'ESFP',
      'ESTJ',
      'ESTP',
      'INFJ',
      'INFP',
      'INTJ',
      'INTP',
      'ISFJ',
      'ISFP',
      'ISTJ',
      'ISTP',
    ];
    return { traits, mbti };
  }

  // Updated to return categories with tag objects {id, label}
  async interestsCategorized(): Promise<{ name: string; tags: { id: number; label: string }[] }[]> {
    // Get all interests to map label -> id
    const interests = await this.interests();
    const interestMap = new Map<string, number>();
    for (const interest of interests) {
      interestMap.set(interest.label, interest.id);
    }

    // Hardcoded categories as before, but now map each tag label to {id, label}
    const categories = [
      {
        name: 'Hobbies & Arts',
        tags: [
          'Acting',
          'Anime',
          'Art gallery',
          'Board games',
          'Creative writing',
          'Design',
          'DIY',
          'Fashion',
          'Film & Cinema',
          'Fireworks',
          'Knitting',
          'Language learning',
          'Live music',
          'Painting',
          'Photography',
          'Reading',
          'Standup comedy',
          'Theatre',
          'Travel',
          'TV shows',
        ],
      },
      {
        name: 'Community',
        tags: ['Activism', 'Family time', 'Politics', 'Spending time with Friends', 'Volunteering'],
      },
      {
        name: 'Food & Drink',
        tags: [
          'Baking',
          'Bubble tea',
          'Cake decorating',
          'Chocolate',
          'Coffee',
          'Cooking',
          'Meat lover',
          'Sushi',
          'Vegetarian',
        ],
      },
      {
        name: 'Outdoors',
        tags: ['Bird watching', 'Camping', 'Fishing'],
      },
      {
        name: 'Sport',
        tags: [
          'American football',
          'Archery',
          'Badminton',
          'Baseball',
          'Basketball',
          'Bowling',
          'Boxing',
          'Cricket',
          'Cycling',
          'Dancing',
          'Fencing',
          'Football',
          'Golf',
          'Gym',
          'Hiking',
          'Horse Riding',
          'Martial arts',
          'Motorsports',
          'Pilates',
          'Rock climbing',
          'Rowing',
          'Rugby',
          'Skateboarding',
          'Skiing',
          'Skydiving',
          'Snowboarding',
          'Surfing',
          'Swimming',
          'Tennis',
          'Volleyball',
        ],
      },
      {
        name: 'Technology',
        tags: ['Blogging', 'Coding', 'Content creation', 'Gaming'],
      },
    ];

    // Map each tag label to {id, label} using the interestMap
    return categories.map(({ name, tags }) => ({
      name,
      tags: tags
        .map(label => {
          const id = interestMap.get(label);
          // If label not found in DB, we skip it (or could use a fallback, but assume all exist)
          return id !== undefined ? { id, label } : null;
        })
        .filter((tag): tag is { id: number; label: string } => tag !== null),
    }));
  }

  // New method for categorized personality traits
  personalityTraitsCategorized(): { name: string; tags: { id: string; label: string }[] }[] {
    // Group traits into categories (arbitrary grouping for demonstration)
    const categories = [
      {
        name: 'Social & Communication',
        tags: [
          'Active Listener',
          'Affectionate',
          'Charismatic',
          'Cheerful',
          'Empathetic',
          'Extrovert',
          'Generous',
          'Genuine',
          'Good with Kids',
          'Open-minded',
          'Outgoing',
          'Patient',
          'Playful',
          'Positive',
          'Respectful',
          'Romantic',
          'Self-aware',
          'Shy',
          'Spontaneous',
          'Thoughtful',
        ],
      },
      {
        name: 'Ambition & Drive',
        tags: [
          'Adventurous',
          'Ambitious',
          'Career-driven',
          'Competitive',
          'Confident',
          'Creative',
          'Entrepreneurial',
          'Intelligent',
          'Liberal',
          'Nerdy',
        ],
      },
      {
        name: 'Lifestyle & Hobbies',
        tags: [
          'Animal Lover',
          'Bookworm',
          'Brunch Lover',
          'Calm',
          'Carefree',
          'Cultural',
          'Family-oriented',
          'Religious',
        ],
      },
    ];

    // Use the label as the id (string) for each trait
    return categories.map(({ name, tags }) => ({
      name,
      tags: tags.map(label => ({ id: label, label })),
    }));
  }

  /**
   * Round coordinates to 2 decimal places (~1.1 km precision at equator)
   * and validate they are within plausible bounds.
   */
  private roundAndValidateCoordinates(lat?: number, lng?: number): { lat: number | null; lng: number | null } {
    const round2 = (val: number | null | undefined): number | null => {
      if (val === null || val === undefined) return null;
      return Math.round(val * 100) / 100;
    };

    const roundedLat = round2(lat);
    const roundedLng = round2(lng);

    // Validate latitude (-90 to 90) and longitude (-180 to 180)
    if (roundedLat !== null && (roundedLat < -90 || roundedLat > 90)) {
      throw new BadRequestException('invalid_latitude');
    }
    if (roundedLng !== null && (roundedLng < -180 || roundedLng > 180)) {
      throw new BadRequestException('invalid_longitude');
    }

    // Note: Client location is untrusted. In production, consider using IP geolocation
    // or GPS attestation as a secondary check.

    return { lat: roundedLat, lng: roundedLng };
  }

  async upsert(userId: string, dto: ProfileInput) {
    // Check if user has completed onboarding (gender and dob are set)
    const existingUser = await this.db.one<{ gender: string | null; dob: Date | null }>(
      'SELECT gender, dob FROM users WHERE id = $1',
      [userId],
    );
    const onboardingComplete = existingUser?.gender !== null && existingUser?.dob !== null;

    // Validate immutable fields after onboarding
    if (onboardingComplete) {
      if (dto.gender !== undefined || dto.dob !== undefined) {
        throw new BadRequestException('gender_and_dob_immutable_after_onboarding');
      }
    }

    // Validate dob as a real date if provided
    if (dto.dob !== undefined) {
      const dobDate = new Date(dto.dob);
      if (isNaN(dobDate.getTime())) {
        throw new BadRequestException('invalid_dob');
      }
    }

    // Validate array max sizes
    if (dto.personalityTraits !== undefined && dto.personalityTraits.length > 10) {
      throw new BadRequestException('personality_traits_too_many');
    }
    if (dto.interestIds !== undefined && dto.interestIds.length > 15) {
      throw new BadRequestException('interests_too_many');
    }
    if (dto.languageIds !== undefined && dto.languageIds.length > 5) {
      throw new BadRequestException('languages_too_many');
    }

    // Round and validate coordinates
    const { lat: roundedLat, lng: roundedLng } = this.roundAndValidateCoordinates(dto.lat, dto.lng);

    // Only screen bio if it's provided
    let bioFlagged = false;
    let bioToSave: string | null = null;
    if (dto.bio !== undefined) {
      const screening = await this.moderation.screenText(dto.bio, userId, 'bio', userId);
      bioFlagged = screening.flagged;
      bioToSave = dto.bio;
    }

    try {
      await this.db.tx(async (conn) => {
        // Update users table - only fields that are provided
        const userUpdates: string[] = [];
        const userParams: unknown[] = [userId];
        let paramIndex = 2;

        if (dto.gender !== undefined) {
          userUpdates.push(`gender = $${paramIndex++}`);
          userParams.push(dto.gender);
        }
        if (dto.dob !== undefined) {
          userUpdates.push(`dob = $${paramIndex++}`);
          userParams.push(dto.dob);
        }
        if (dto.location !== undefined) {
          userUpdates.push(`location = $${paramIndex++}`);
          userParams.push(dto.location);
        }
        if (dto.lat !== undefined || dto.lng !== undefined) {
          // Only update lat/lng if provided
          if (dto.lat !== undefined) {
            userUpdates.push(`lat = $${paramIndex++}`);
            userParams.push(roundedLat);
          }
          if (dto.lng !== undefined) {
            userUpdates.push(`lng = $${paramIndex++}`);
            userParams.push(roundedLng);
          }
        }

        if (userUpdates.length > 0) {
          await conn.query(
            `UPDATE users SET ${userUpdates.join(', ')} WHERE id = $1`,
            userParams,
          );
        }

        // Build dynamic profile update - only fields that are provided
        const profileUpdates: string[] = ['updated_at = now()'];
        const profileParams: unknown[] = [userId];
        let profileParamIndex = 2;

        // Map of DTO fields to database columns
        const fieldMap: Record<string, { dtoField: keyof ProfileInput; dbColumn: string; isArray?: boolean }> = {
          name: { dtoField: 'name', dbColumn: 'name' },
          bio: { dtoField: 'bio', dbColumn: 'bio' },
          education: { dtoField: 'education', dbColumn: 'education' },
          profession: { dtoField: 'profession', dbColumn: 'profession' },
          sect: { dtoField: 'sect', dbColumn: 'sect' },
          nationality: { dtoField: 'nationality', dbColumn: 'nationality' },
          ethnicity: { dtoField: 'ethnicity', dbColumn: 'ethnicity' },
          maritalStatus: { dtoField: 'maritalStatus', dbColumn: 'marital_status' },
          relationshipTimelineIntent: { dtoField: 'relationshipTimelineIntent', dbColumn: 'relationship_timeline_intent' },
          marriageTimelineIntent: { dtoField: 'marriageTimelineIntent', dbColumn: 'marriage_timeline_intent' },
          religiousPracticeLevel: { dtoField: 'religiousPracticeLevel', dbColumn: 'religious_practice_level' },
          drinksAlcohol: { dtoField: 'drinksAlcohol', dbColumn: 'drinks_alcohol' },
          wouldMoveAbroad: { dtoField: 'wouldMoveAbroad', dbColumn: 'would_move_abroad' },
          personalityTraits: { dtoField: 'personalityTraits', dbColumn: 'personality_traits', isArray: true },
          interestIds: { dtoField: 'interestIds', dbColumn: 'interestIds', isArray: true },
          languageIds: { dtoField: 'languageIds', dbColumn: 'languageIds', isArray: true },
        };

        for (const [key, mapping] of Object.entries(fieldMap)) {
          const dtoKey = mapping.dtoField as keyof ProfileInput;
          if (dto[dtoKey] !== undefined) {
            profileUpdates.push(`${mapping.dbColumn} = $${profileParamIndex++}`);
            // For arrays, pass the array (null means clear)
            if (mapping.isArray) {
              profileParams.push(dto[dtoKey] ?? null);
            } else {
              profileParams.push(dto[dtoKey]);
            }
          }
        }

        // Handle bio separately since it has moderation flag
        if (dto.bio !== undefined) {
          profileUpdates.push(`bio = $${profileParamIndex++}`);
          profileParams.push(bioToSave);
          profileUpdates.push(`bio_flagged = $${profileParamIndex++}`);
          profileParams.push(bioFlagged);
        }

        if (profileUpdates.length > 1) { // More than just updated_at
          // Upsert profile
          await conn.query(
            `INSERT INTO profiles (user_id) VALUES ($1)
             ON CONFLICT (user_id) DO UPDATE SET ${profileUpdates.join(', ')}`,
            profileParams,
          );
        }

        if (dto.interestIds !== undefined) {
          await this.replaceTags(conn, 'user_interests', 'interest_id', userId, dto.interestIds);
        }
        if (dto.languageIds !== undefined) {
          await this.replaceTags(conn, 'user_languages', 'language_id', userId, dto.languageIds);
        }
      });
    } catch (err) {
      if ((err as { message?: string }).message?.includes('under_min_age')) {
        throw new BadRequestException('under_min_age');
      }
      throw err;
    }

    return this.me(userId);
  }

  /**
   * Spec 1.2 — photos arrive pre-uploaded to storage by the client; this endpoint
   * records the URL, screens it, and re-opens verification when it is primary.
   * Uses profile_photos table with atomic operations.
   */
  async addPhoto(userId: string, url: string, makePrimary?: boolean) {
    // Get current photos from profile_photos table
    const existingPhotos = await this.db.all<{ position: number; url: string }>(
      'SELECT position, url FROM profile_photos WHERE profile_id = $1 ORDER BY position',
      [userId],
    );

    if (existingPhotos.length >= MAX_PHOTOS) throw new BadRequestException('photo_limit_reached');

    const isPrimary = makePrimary ?? existingPhotos.length === 0;
    const previousPrimary = existingPhotos.find(p => p.position === 0)?.url ?? null;

    await this.moderation.screenImage(userId, url, `${userId}:${existingPhotos.length + 1}`);

    await this.db.tx(async (conn) => {
      if (isPrimary) {
        // Shift existing photos down by 1
        await conn.query(
          `UPDATE profile_photos SET position = position + 1 WHERE profile_id = $1`,
          [userId],
        );
        // Insert new primary at position 0
        await conn.query(
          `INSERT INTO profile_photos (profile_id, position, url, status) VALUES ($1, 0, $2, 'pending')`,
          [userId, url],
        );
      } else {
        // Insert at next available position
        await conn.query(
          `INSERT INTO profile_photos (profile_id, position, url, status) VALUES ($1, $2, $3, 'pending')`,
          [userId, existingPhotos.length, url],
        );
      }
      // Update profiles.updated_at
      await conn.query(
        `UPDATE profiles SET updated_at = now() WHERE user_id = $1`,
        [userId],
      );
    });

    // Trigger on profile_photos will handle verification reset
    if (isPrimary && previousPrimary !== url) {
      await this.verification.reopen(userId, previousPrimary ? 'primary_photo_changed' : 'initial_photo');
    }

    const newPhotos = await this.getPhotosArray(userId);
    return { photos: newPhotos, primaryPhoto: newPhotos[0] ?? null, reVerificationRequired: isPrimary };
  }

  async setPhotos(userId: string, urls: string[]) {
    if (urls.length > MAX_PHOTOS) throw new BadRequestException('photo_limit_reached');

    const existingPhotos = await this.db.all<{ position: number; url: string }>(
      'SELECT position, url FROM profile_photos WHERE profile_id = $1 ORDER BY position',
      [userId],
    );
    const previousPrimary = existingPhotos.find(p => p.position === 0)?.url ?? null;
    const nextPrimary = urls[0];

    for (let i = 0; i < urls.length; i++) {
      await this.moderation.screenImage(userId, urls[i], `${userId}:${i + 1}`);
    }

    await this.db.tx(async (conn) => {
      // Delete existing photos
      await conn.query('DELETE FROM profile_photos WHERE profile_id = $1', [userId]);
      // Insert new photos
      for (let i = 0; i < urls.length; i++) {
        await conn.query(
          `INSERT INTO profile_photos (profile_id, position, url, status) VALUES ($1, $2, $3, 'pending')`,
          [userId, i, urls[i]],
        );
      }
      // Update profiles.updated_at
      await conn.query(
        `UPDATE profiles SET updated_at = now() WHERE user_id = $1`,
        [userId],
      );
    });

    if (nextPrimary && previousPrimary !== nextPrimary) {
      await this.verification.reopen(userId, previousPrimary ? 'primary_photo_changed' : 'initial_photo');
    }

    const newPhotos = await this.getPhotosArray(userId);
    return { photos: newPhotos, primaryPhoto: newPhotos[0] ?? null };
  }

  private async getPhotosArray(userId: string): Promise<string[]> {
    const photos = await this.db.all<{ url: string }>(
      'SELECT url FROM profile_photos WHERE profile_id = $1 ORDER BY position',
      [userId],
    );
    return photos.map(p => p.url);
  }

  async me(userId: string) {
    const [user, profile, interests, languages, photos] = await Promise.all([
      this.db.one<UserRow>(
        'SELECT id, email, phone, phone_verified, gender, dob, location, lat, lng, created_at FROM users WHERE id = $1',
        [userId],
      ),
      this.db.one<ProfileRow>('SELECT * FROM profiles WHERE user_id = $1', [userId]),
      this.db.repo<TagRow>('interests').all(
        `SELECT i.id, i.label FROM interests i
         JOIN user_interests ui ON ui.interest_id = i.id WHERE ui.user_id = $1 ORDER BY i.label`,
        [userId],
      ),
      this.db.repo<TagRow>('languages').all(
        `SELECT l.id, l.label FROM languages l
         JOIN user_languages ul ON ul.language_id = l.id WHERE ul.user_id = $1 ORDER BY l.label`,
        [userId],
      ),
      this.getPhotosArray(userId),
    ]);

    return {
      user,
      profile: profile && { ...profile, photos, primaryPhoto: photos[0] ?? null },
      interests,
      languages,
    };
  }

  private async replaceTags(
    conn: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
    table: string,
    column: string,
    userId: string,
    ids?: number[],
  ): Promise<void> {
    await conn.query(`DELETE FROM ${table} WHERE user_id = $1`, [userId]);
    if (!ids?.length) return;
    // unnest + join keeps this one round trip and drops ids that aren't real tags.
    await conn.query(
      `INSERT INTO ${table} (user_id, ${column})
       SELECT $1, t.id FROM unnest($2::int[]) AS t(id)
       JOIN ${column === 'interest_id' ? 'interests' : 'languages'} x ON x.id = t.id
       ON CONFLICT DO NOTHING`,
      [userId, ids],
    );
  }
}