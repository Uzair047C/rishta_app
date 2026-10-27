-- Migration 0006: Add webhook_events table for RevenueCat deduplication

CREATE TABLE webhook_events (
  id text PRIMARY KEY,
  received_at timestamptz NOT NULL DEFAULT now()
);

-- Add last_event_at_ms to subscriptions for out-of-order event handling
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS last_event_at_ms bigint;