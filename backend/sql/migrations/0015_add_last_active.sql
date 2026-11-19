-- Migration 0015: Add last_active column for feed activity signal
-- Idempotent and additive

-- Add last_active to users table (tracks meaningful activity: login, like, message)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'last_active'
  ) THEN
    ALTER TABLE users ADD COLUMN last_active timestamptz NOT NULL DEFAULT now();
  END IF;
END $$;

-- Index for feed sorting by activity
CREATE INDEX IF NOT EXISTS users_last_active_idx ON users (last_active DESC) WHERE status = 'active';

-- Update existing users to have last_active = created_at
UPDATE users SET last_active = created_at WHERE last_active IS NULL;