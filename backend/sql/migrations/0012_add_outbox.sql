-- Migration 0012: Add outbox table for reliable side effects
-- This table stores events that need to be processed after a transaction commits
-- A pg-boss worker will process these with retries and dead-lettering

CREATE TABLE IF NOT EXISTS outbox (
  id bigserial PRIMARY KEY,
  type text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  attempts int NOT NULL DEFAULT 0,
  last_error text,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  dead_at timestamptz
);

-- Replace pending index with one on next_attempt_at for retry scheduling
DROP INDEX IF EXISTS outbox_pending_idx;
CREATE INDEX IF NOT EXISTS outbox_pending_idx ON outbox (next_attempt_at) WHERE processed_at IS NULL AND dead_at IS NULL;