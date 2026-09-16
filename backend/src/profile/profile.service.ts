import { BadRequestException, Injectable } from '@nestjs/common';
import { Db } from '../db/db';
import { ProfileRow, TagRow, UserRow } from '../db/types';
import { ModerationService } from '../moderation/moderation.service';
import { VerificationService } from '../verification/verification.service';

const MAX_PHOTOS = 6;

export interface ProfileInput {
  name: string;
  gender: 'male' | 'female' | 'other';
  dob: string;
  location?: string;
  lat?: number;
  lng?: number;
  bio?: string;
  education?: string;
  profession?: string;
  maritalStatus?: 'never_married' | 'divorced' | 'widowed';
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

  async upsert(user: UserRow, dto: ProfileInput) {
    const bio = dto.bio ?? '';
    const screening = await this.moderation.screenText(bio, user.id, 'bio', user.id);

    try {
      await this.db.tx(async (conn) => {
        // The users_min_age trigger rejects dob under 18 here regardless of what
        // the client sent — spec 2.3, server-side age enforcement.
        await conn.query(
          `UPDATE users SET gender = $2, dob = $3, location = $4, lat = $5, lng = $6 WHERE id = $1`,
          [user.id, dto.gender, dto.dob, dto.location ?? null, dto.lat ?? null, dto.lng ?? null],
        );

        await conn.query(
          `INSERT INTO profiles (user_id, name, bio, education, profession, marital_status, bio_flagged)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (user_id) DO UPDATE SET
             name = EXCLUDED.name,
             bio = EXCLUDED.bio,
             education = EXCLUDED.education,
             profession = EXCLUDED.profession,
             marital_status = EXCLUDED.marital_status,
             bio_flagged = EXCLUDED.bio_flagged,
             updated_at = now()`,
          [
            user.id,
            dto.name,
            bio,
            dto.education ?? null,
            dto.profession ?? null,
            dto.maritalStatus ?? null,
            screening.flagged,
          ],
        );

        await this.replaceTags(conn, 'user_interests', 'interest_id', user.id, dto.interestIds);
        await this.replaceTags(conn, 'user_languages', 'language_id', user.id, dto.languageIds);
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
