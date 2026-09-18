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

  async upsert(user: UserRow, dto: ProfileInput) {
    const bio = dto.bio ?? '';
    const screening = await this.moderation.screenText(bio, user.id, 'bio', user.id);

    try {
      await this.db.tx(async (conn) => {
        // The users_min_age trigger rejects dob under 18 here regardless of what
        // the client sent — spec 2.3, server-side age enforcement.
        if (dto.gender !== undefined || dto.dob !== undefined || dto.location !== undefined) {
          await conn.query(
            `UPDATE users SET
               gender = COALESCE($2, gender),
               dob = COALESCE($3, dob),
               location = COALESCE($4, location),
               lat = COALESCE($5, lat),
               lng = COALESCE($6, lng)
             WHERE id = $1`,
            [user.id, dto.gender ?? null, dto.dob ?? null, dto.location ?? null, dto.lat ?? null, dto.lng ?? null],
          );
        }

        await conn.query(
          `INSERT INTO profiles (
             user_id, name, bio, education, profession, sect, nationality, ethnicity,
             marital_status, relationship_timeline_intent, marriage_timeline_intent,
             religious_practice_level, drinks_alcohol, would_move_abroad, personality_traits, bio_flagged
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
           ON CONFLICT (user_id) DO UPDATE SET
             name = COALESCE(EXCLUDED.name, profiles.name),
             bio = EXCLUDED.bio,
             education = COALESCE(EXCLUDED.education, profiles.education),
             profession = COALESCE(EXCLUDED.profession, profiles.profession),
             sect = COALESCE(EXCLUDED.sect, profiles.sect),
             nationality = COALESCE(EXCLUDED.nationality, profiles.nationality),
             ethnicity = COALESCE(EXCLUDED.ethnicity, profiles.ethnicity),
             marital_status = COALESCE(EXCLUDED.marital_status, profiles.marital_status),
             relationship_timeline_intent = COALESCE(EXCLUDED.relationship_timeline_intent, profiles.relationship_timeline_intent),
             marriage_timeline_intent = COALESCE(EXCLUDED.marriage_timeline_intent, profiles.marriage_timeline_intent),
             religious_practice_level = COALESCE(EXCLUDED.religious_practice_level, profiles.religious_practice_level),
             drinks_alcohol = COALESCE(EXCLUDED.drinks_alcohol, profiles.drinks_alcohol),
             would_move_abroad = COALESCE(EXCLUDED.would_move_abroad, profiles.would_move_abroad),
             personality_traits = COALESCE(EXCLUDED.personality_traits, profiles.personality_traits),
             bio_flagged = EXCLUDED.bio_flagged,
             updated_at = now()`,
          [
            user.id,
            dto.name ?? null,
            bio,
            dto.education ?? null,
            dto.profession ?? null,
            dto.sect ?? null,
            dto.nationality ?? null,
            dto.ethnicity ?? null,
            dto.maritalStatus ?? null,
            dto.relationshipTimelineIntent ?? null,
            dto.marriageTimelineIntent ?? null,
            dto.religiousPracticeLevel ?? null,
            dto.drinksAlcohol ?? null,
            dto.wouldMoveAbroad ?? null,
            dto.personalityTraits ?? [],
            screening.flagged,
          ],
        );

        if (dto.interestIds !== undefined) {
          await this.replaceTags(conn, 'user_interests', 'interest_id', user.id, dto.interestIds);
        }
        if (dto.languageIds !== undefined) {
          await this.replaceTags(conn, 'user_languages', 'language_id', user.id, dto.languageIds);
        }
      });
    } catch (err) {
      if ((err as { message?: string }).message?.includes('under_min_age')) {
        throw new BadRequestException('under_min_age');
      }
      throw err;
    }

    return this.me(user.id);
  }

  /**
   * Spec 1.2 — photos arrive pre-uploaded to storage by the client; this endpoint
   * records the URL, screens it, and re-opens verification when it is primary.
   */
  async addPhoto(userId: string, url: string, makePrimary?: boolean) {
    const existing = await this.db.one<ProfileRow>('SELECT * FROM profiles WHERE user_id = $1', [userId]);
    const photos = existing?.photos ?? [];

    if (!existing) {
      await this.db.query('INSERT INTO profiles (user_id) VALUES ($1)', [userId]);
    }
    if (photos.length >= MAX_PHOTOS) throw new BadRequestException('photo_limit_reached');

    const isPrimary = makePrimary ?? photos.length === 0;
    const previousPrimary = photos[0];
    const next = isPrimary ? [url, ...photos] : [...photos, url];

    await this.moderation.screenImage(userId, url, `${userId}:${next.length}`);
    await this.db.query('UPDATE profiles SET photos = $2, updated_at = now() WHERE user_id = $1', [
      userId,
      next,
    ]);

    // The trigger already reset verification_status to 'pending'; this records
    // the audit event that the pending screen and review queue read.
    if (isPrimary && previousPrimary !== url) {
      await this.verification.reopen(userId, previousPrimary ? 'primary_photo_changed' : 'initial_photo');
    }

    return { photos: next, primaryPhoto: next[0], reVerificationRequired: isPrimary };
  }

  async setPhotos(userId: string, urls: string[]) {
    if (urls.length > MAX_PHOTOS) throw new BadRequestException('photo_limit_reached');
    const existing = await this.db.one<ProfileRow>('SELECT * FROM profiles WHERE user_id = $1', [userId]);
    if (!existing) {
      await this.db.query('INSERT INTO profiles (user_id) VALUES ($1)', [userId]);
    }

    const previousPrimary = existing?.photos?.[0];
    const nextPrimary = urls[0];

    for (let i = 0; i < urls.length; i++) {
      await this.moderation.screenImage(userId, urls[i], `${userId}:${i + 1}`);
    }

    await this.db.query('UPDATE profiles SET photos = $2, updated_at = now() WHERE user_id = $1', [
      userId,
      urls,
    ]);

    if (nextPrimary && previousPrimary !== nextPrimary) {
      await this.verification.reopen(userId, previousPrimary ? 'primary_photo_changed' : 'initial_photo');
    }

    return { photos: urls, primaryPhoto: urls[0] ?? null };
  }

  async me(userId: string) {
    const [user, profile, interests, languages] = await Promise.all([
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
    ]);

    return {
      user,
      profile: profile && { ...profile, primaryPhoto: profile.photos[0] ?? null },
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