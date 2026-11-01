-- Migration 0002: Add firebase_uid column and email unique index
-- Idempotent and additive

DO $$
BEGIN
  -- Add firebase_uid column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'firebase_uid'
  ) THEN
    ALTER TABLE users ADD COLUMN firebase_uid text UNIQUE;
  END IF;
END
$$;

-- Add partial unique index on email (lowercase, where not null)
CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique_lower ON users (lower(email)) WHERE email IS NOT NULL;

-- Note: Backfill of firebase_uid from provider_subject moved to migration 0010
-- since auth_provider and provider_subject columns don't exist at this point.