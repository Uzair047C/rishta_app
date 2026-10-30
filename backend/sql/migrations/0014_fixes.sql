-- Migration 0014: Fixes from code review round 2
-- Idempotent and additive

-- 1. Add profiles.city column (feed selects/filters p.city)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'city'
  ) THEN
    ALTER TABLE profiles ADD COLUMN city text;
  END IF;
END $$;

-- 2. Allow 'paused' in subscriptions.status
-- Drop and recreate the CHECK constraint
DO $$
BEGIN
  -- Drop existing constraint
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'subscriptions' AND constraint_name = 'subscriptions_status_check'
  ) THEN
    ALTER TABLE subscriptions DROP CONSTRAINT subscriptions_status_check;
  END IF;
  -- Add new constraint with 'paused'
  ALTER TABLE subscriptions
    ADD CONSTRAINT subscriptions_status_check
    CHECK (status IN ('active', 'expired', 'cancelled', 'inactive', 'paused'));
END $$;

-- 3. Reports: partial unique index for dedupe and fix ON CONFLICT
-- First, de-duplicate existing open reports (keep oldest)
DELETE FROM reports r1
USING reports r2
WHERE r1.reporter_id = r2.reporter_id
  AND r1.reported_id = r2.reported_id
  AND r1.status = 'open'
  AND r2.status = 'open'
  AND r1.ctid > r2.ctid;

-- Create partial unique index
CREATE UNIQUE INDEX IF NOT EXISTS reports_open_unique
  ON reports (reporter_id, reported_id)
  WHERE status = 'open';

-- 4. Outbox: ensure next_attempt_at and dead_at exist (added in 0012, ensure here for safety)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'outbox' AND column_name = 'next_attempt_at'
  ) THEN
    ALTER TABLE outbox ADD COLUMN next_attempt_at timestamptz NOT NULL DEFAULT now();
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'outbox' AND column_name = 'dead_at'
  ) THEN
    ALTER TABLE outbox ADD COLUMN dead_at timestamptz;
  END IF;
END $$;

-- Replace pending index with one on next_attempt_at for retry scheduling
DROP INDEX IF EXISTS outbox_pending_idx;
CREATE INDEX IF NOT EXISTS outbox_pending_idx ON outbox (next_attempt_at) WHERE processed_at IS NULL AND dead_at IS NULL;

-- 5. Idempotency keys table for client retry dedupe
CREATE TABLE IF NOT EXISTS idempotency_keys (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key text NOT NULL,
  route text NOT NULL,
  response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);

-- Cleanup index for TTL-based cleanup (24h)
CREATE INDEX IF NOT EXISTS idempotency_keys_created_idx ON idempotency_keys (created_at);