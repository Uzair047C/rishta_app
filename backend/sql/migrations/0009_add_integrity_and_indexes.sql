-- Migration 0009: Add integrity constraints, indexes, and PostGIS support
-- This migration:
-- 1. Adds unmatched_by to matches, CHECK on likes_remaining_today
-- 2. Adds likes(to_user_id, created_at DESC) index for "who liked me"
-- 3. Enables PostGIS, adds users.geo geography(Point,4326) with trigger and GiST index
-- 4. Adds webhook_events table (if not already exists from 0006)

-- 1. matches: add unmatched_by column
ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS unmatched_by uuid REFERENCES users(id) ON DELETE SET NULL;

-- 2. subscriptions: add CHECK constraint for non-negative likes_remaining_today
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'subscriptions' AND constraint_name = 'subscriptions_likes_remaining_today_nonneg'
  ) THEN
    ALTER TABLE subscriptions
      ADD CONSTRAINT subscriptions_likes_remaining_today_nonneg
      CHECK (likes_remaining_today >= 0);
  END IF;
END $$;

-- 3. likes index for "who liked me" queries
CREATE INDEX IF NOT EXISTS likes_to_user_created_idx ON likes (to_user_id, created_at DESC);

-- 4. Enable PostGIS and add users.geo
CREATE EXTENSION IF NOT EXISTS postgis;

-- Add geo column if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'geo'
  ) THEN
    ALTER TABLE users ADD COLUMN geo geography(Point, 4326);
  END IF;
END $$;

-- Create trigger function to populate geo from lat/lng
CREATE OR REPLACE FUNCTION update_user_geo() RETURNS trigger AS $$
BEGIN
  IF NEW.lat IS NOT NULL AND NEW.lng IS NOT NULL THEN
    NEW.geo := ST_SetSRID(ST_MakePoint(NEW.lng, NEW.lat), 4326)::geography;
  ELSE
    NEW.geo := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if any, then create new one
DROP TRIGGER IF EXISTS users_geo_update ON users;
CREATE TRIGGER users_geo_update
  BEFORE INSERT OR UPDATE OF lat, lng ON users
  FOR EACH ROW EXECUTE FUNCTION update_user_geo();

-- Backfill existing rows
UPDATE users
SET geo = ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography
WHERE lat IS NOT NULL AND lng IS NOT NULL AND geo IS NULL;

-- GiST index on geo for spatial queries
CREATE INDEX IF NOT EXISTS users_geo_idx ON users USING GIST (geo);

-- 5. webhook_events table (idempotency for webhooks) - created in 0006, ensure it exists
CREATE TABLE IF NOT EXISTS webhook_events (
  id text PRIMARY KEY,
  received_at timestamptz NOT NULL DEFAULT now()
);

-- Note: messages table is retained for account export/deletion endpoints
-- Chat is entirely on Stream; this table is not used for live messaging.
-- If fully migrating to Stream, update account.controller.ts and then drop.