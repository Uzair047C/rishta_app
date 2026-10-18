-- Add authentication provider columns to users table
-- Migration is additive and idempotent

DO $$
BEGIN
  -- Add auth_provider column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'auth_provider'
  ) THEN
    ALTER TABLE users ADD COLUMN auth_provider text;
  END IF;

  -- Add provider_subject column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'provider_subject'
  ) THEN
    ALTER TABLE users ADD COLUMN provider_subject text;
  END IF;

  -- Add email_verified column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'email_verified'
  ) THEN
    ALTER TABLE users ADD COLUMN email_boolean boolean DEFAULT false;
  END IF;
END
$$;

-- Create unique index on (auth_provider, provider_subject) where provider_subject is not null
-- Only create if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'users_auth_provider_provider_subject_uq'
    AND n.nspname = 'public'
  ) THEN
    CREATE UNIQUE INDEX users_auth_provider_provider_subject_uq
    ON users (auth_provider, provider_subject)
    WHERE provider_subject IS NOT NULL;
  END IF;
END
$$;

-- Create unique index on lower(email) where email is not null
-- Only create if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'users_lower_email_uq'
    AND n.nspname = 'public'
  ) THEN
    CREATE UNIQUE INDEX users_lower_email_uq
    ON users (lower(email))
    WHERE email IS NOT NULL;
  END IF;
END
$$;