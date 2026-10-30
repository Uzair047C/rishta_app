-- Migration 0012: Add outbox table for reliable side effects
-- This table stores events that need to be processed after a transaction commits
-- A pg-boss worker will process these with retries and dead-lettering

BEGIN;

CREATE TABLE IF NOT EXISTS outbox (
  id bigserial PRIMARY KEY,
  type text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  attempts int NOT NULL DEFAULT 0,
  last_error text
);

CREATE INDEX IF NOT EXISTS outbox_pending_idx ON outbox (created_at) WHERE processed_at IS NULL;

COMMIT;