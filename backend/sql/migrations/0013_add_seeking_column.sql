-- Migration 0013: Add seeking column to profiles
-- Default: male users seek female, female users seek male, others seek any

BEGIN;

-- Add seeking column to profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'seeking'
  ) THEN
    ALTER TABLE profiles ADD COLUMN seeking text NOT NULL DEFAULT 'any'
      CHECK (seeking IN ('male', 'female', 'any'));
  END IF;
END $$;

-- Backfill seeking based on user's gender
UPDATE profiles p
SET seeking = CASE
  WHEN u.gender = 'male' THEN 'female'
  WHEN u.gender = 'female' THEN 'male'
  ELSE 'any'
END
FROM users u
WHERE p.user_id = u.id
  AND p.seeking = 'any'; -- Only backfill defaults

COMMIT;