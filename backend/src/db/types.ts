/** Row shapes for the tables the API reads. Mirrors sql/schema.sql. */

export type Gender = 'male' | 'female' | 'other';
export type MaritalStatus = 'never_married' | 'divorced' | 'widowed';
export type VerificationStatus = 'pending' | 'verified' | 'failed';
export type SubscriptionStatus = 'active' | 'expired' | 'cancelled' | 'inactive';
export type FlagStatus = 'open' | 'reviewing' | 'actioned' | 'dismissed';

export interface UserRow {
  id: string;
  firebase_uid: string;
  email: string | null;
  phone: string | null;
  phone_verified: boolean;
  gender: Gender | null;
  dob: Date | null;
  location: string | null;
  lat: number | null;
  lng: number | null;
  device_id: string | null;
  created_at: Date;
}

export interface ProfileRow {
  user_id: string;
  name: string | null;
  bio: string;
  education: string | null;
  profession: string | null;
  marital_status: MaritalStatus | null;
  photos: string[];
  bio_flagged: boolean;
  verification_status: VerificationStatus;
  updated_at: Date;
}

export interface SubscriptionRow {
  user_id: string;
  status: SubscriptionStatus;
  plan: string;
  daily_allowance: number;
  likes_remaining_today: number;
  started_at: Date | null;
  renews_at: Date | null;
  quota_reset_at: Date;
}

export interface TagRow {
  id: number;
  label: string;
}

export interface MatchRow {
  id: string;
  user_a_id: string;
  user_b_id: string;
  matched_at: Date;
  unmatched_at: Date | null;
}

export interface VerificationEventRow {
  id: string;
  user_id: string;
  selfie_url: string;
  match_score: number | null;
  liveness_score: number | null;
  result: VerificationStatus;
  reason: string | null;
  created_at: Date;
}

export interface ModerationFlagRow {
  id: string;
  user_id: string | null;
  source: 'bio' | 'photo' | 'message';
  ref_id: string | null;
  content: string | null;
  labels: unknown;
  score: number | null;
  status: FlagStatus;
  created_at: Date;
}

/** Shape returned by GET /feed — a profile joined to its owner's public fields. */
export interface FeedCard {
  user_id: string;
  name: string | null;
  age: number;
  gender: Gender;
  location: string | null;
  bio: string;
  profession: string | null;
  education: string | null;
  marital_status: MaritalStatus | null;
  photos: string[];
  verification_status: VerificationStatus;
  shared_interests: number;
  distance_km: number | null;
}
