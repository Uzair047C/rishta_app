-- Rishta — PostgreSQL schema.
--
-- Design note: the spec's critical server-side rules that CAN be expressed as a
-- constraint or trigger are, because a constraint cannot be bypassed by a future
-- code path that forgets the rule. Specifically:
--   * minimum age          -> trigger enforce_min_age (spec 2.3)
--   * verified phone unique-> partial unique index (spec 2.3 duplicate accounts)
--   * re-verify on photo   -> trigger reset_verification_on_photo_change (spec 2.3)
--   * no duplicate matches -> normalized pair + unique index
-- The atomic like-quota decrement is the one rule that stays in application SQL,
-- since it is a read-modify-write against a live counter (spec 2.3).

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()

-- ---------------------------------------------------------------- users

CREATE TABLE users (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firebase_uid   text NOT NULL,
  email          text,
  phone          text,
  phone_verified boolean NOT NULL DEFAULT false,
  -- gender + dob stay NULL until onboarding completes, hence the paired CHECK.
  gender         text CHECK (gender IN ('male', 'female', 'other')),
  dob            date,
  location       text,
  lat            double precision,
  lng            double precision,
  auth_provider  text NOT NULL DEFAULT 'firebase',
  device_id      text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CHECK ((gender IS NULL) = (dob IS NULL))
);

CREATE UNIQUE INDEX users_firebase_uid_uniq ON users (firebase_uid);
-- Duplicate-account prevention: a *verified* phone may exist only once.
-- Partial index so many rows may hold an unverified/NULL phone.
CREATE UNIQUE INDEX users_phone_verified_uniq ON users (phone) WHERE phone_verified;
CREATE INDEX users_device_id_idx ON users (device_id) WHERE device_id IS NOT NULL;
CREATE INDEX users_feed_idx ON users (gender, dob) WHERE gender IS NOT NULL;

CREATE OR REPLACE FUNCTION enforce_min_age() RETURNS trigger AS $$
BEGIN
  IF NEW.dob IS NOT NULL AND NEW.dob > (CURRENT_DATE - INTERVAL '18 years') THEN
    RAISE EXCEPTION 'under_min_age' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_min_age
  BEFORE INSERT OR UPDATE OF dob ON users
  FOR EACH ROW EXECUTE FUNCTION enforce_min_age();

-- ------------------------------------------------------------- profiles

CREATE TABLE profiles (
  user_id             uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  -- Spec 1.2 lists Name as a profile-creation field but the 2.2 data model has
  -- no column for it; added here rather than dropping the field.
  name                text,
  bio                 text NOT NULL DEFAULT '',
  education           text,
  profession          text,
  marital_status      text CHECK (marital_status IN ('never_married', 'divorced', 'widowed')),
  -- photos[1] is the PRIMARY photo. Array over a join table: the spec models it
  -- as photos[], and nothing queries an individual non-primary photo.
  photos              text[] NOT NULL DEFAULT '{}',
  bio_flagged         boolean NOT NULL DEFAULT false,
  verification_status text NOT NULL DEFAULT 'pending'
                        CHECK (verification_status IN ('pending', 'verified', 'failed')),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Spec 2.3: changing the primary photo re-opens verification. A trigger rather
-- than service code, so no future update path can silently skip it.
CREATE OR REPLACE FUNCTION reset_verification_on_photo_change() RETURNS trigger AS $$
BEGIN
  IF NEW.photos[1] IS DISTINCT FROM OLD.photos[1] THEN
    NEW.verification_status := 'pending';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_reverify_on_photo_change
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION reset_verification_on_photo_change();

-- ------------------------------------------------- interests / languages

CREATE TABLE interests (
  id    serial PRIMARY KEY,
  label text NOT NULL UNIQUE
);

CREATE TABLE languages (
  id    serial PRIMARY KEY,
  label text NOT NULL UNIQUE
);

CREATE TABLE user_interests (
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  interest_id int  NOT NULL REFERENCES interests(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, interest_id)
);

CREATE TABLE user_languages (
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  language_id int  NOT NULL REFERENCES languages(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, language_id)
);

-- ------------------------------------------------ likes / passes / blocks

CREATE TABLE likes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (from_user_id, to_user_id),
  CHECK (from_user_id <> to_user_id)
);

CREATE TABLE passes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  passed_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, passed_user_id),
  CHECK (user_id <> passed_user_id)
);

CREATE TABLE blocks (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);
CREATE INDEX blocks_blocked_id_idx ON blocks (blocked_id);

-- -------------------------------------------------------------- matches

CREATE TABLE matches (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Pair is normalized (smaller uuid first) at write time so the UNIQUE index
  -- actually prevents A-match-B and B-match-A from both existing.
  user_a_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_b_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  matched_at   timestamptz NOT NULL DEFAULT now(),
  unmatched_at timestamptz,
  CHECK (user_a_id < user_b_id),
  UNIQUE (user_a_id, user_b_id)
);

CREATE TABLE messages (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id   uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  sender_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content    text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX messages_match_idx ON messages (match_id, created_at DESC);

-- -------------------------------------------------------- subscriptions

-- One row per user (PK is user_id) so the atomic decrement in spec 2.3 is a
-- single UPDATE with no secondary lookup.
CREATE TABLE subscriptions (
  user_id               uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  status                text NOT NULL DEFAULT 'inactive'
                          CHECK (status IN ('active', 'expired', 'cancelled', 'inactive')),
  plan                  text NOT NULL DEFAULT 'free',
  daily_allowance       int  NOT NULL DEFAULT 10,
  likes_remaining_today int  NOT NULL DEFAULT 10,
  started_at            timestamptz,
  renews_at             timestamptz,
  quota_reset_at        timestamptz NOT NULL DEFAULT now()
);

-- -------------------------------------------------- verification / trust

CREATE TABLE verification_events (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  selfie_url     text NOT NULL,
  match_score    double precision,
  liveness_score double precision,
  result         text NOT NULL CHECK (result IN ('pending', 'verified', 'failed')),
  reason         text,
  reviewed_by    uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX verification_events_user_idx ON verification_events (user_id, created_at DESC);

CREATE TABLE reports (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reported_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  match_id    uuid REFERENCES matches(id) ON DELETE SET NULL,
  message_id  uuid REFERENCES messages(id) ON DELETE SET NULL,
  reason      text NOT NULL,
  status      text NOT NULL DEFAULT 'open'
                CHECK (status IN ('open', 'reviewing', 'actioned', 'dismissed')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (reporter_id <> reported_id)
);

-- Spec 2.5: the flagging pipeline must exist before real users message each
-- other; the review queue is the human interface on top of it.
CREATE TABLE moderation_flags (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid REFERENCES users(id) ON DELETE CASCADE,
  source     text NOT NULL CHECK (source IN ('bio', 'photo', 'message')),
  ref_id     text,
  content    text,
  labels     jsonb NOT NULL DEFAULT '[]'::jsonb,
  score      double precision,
  status     text NOT NULL DEFAULT 'open'
               CHECK (status IN ('open', 'reviewing', 'actioned', 'dismissed')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX moderation_flags_open_idx ON moderation_flags (status, created_at DESC);

-- ------------------------------------------- notification preferences

-- Not in the spec's data model, but the GET/PUT endpoints in 2.4 need storage.
CREATE TABLE notification_preferences (
  user_id    uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  new_like   boolean NOT NULL DEFAULT true,
  new_match  boolean NOT NULL DEFAULT true,
  new_message boolean NOT NULL DEFAULT true,
  marketing  boolean NOT NULL DEFAULT false
);

-- Push device tokens, written by the mobile client after FCM registration.
CREATE TABLE device_tokens (
  token      text PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform   text NOT NULL CHECK (platform IN ('android', 'ios', 'web')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX device_tokens_user_idx ON device_tokens (user_id);
