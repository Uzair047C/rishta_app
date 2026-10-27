-- Migration 0002: Add firebase_uid column and email unique index

-- Add firebase_uid column to users table
ALTER TABLE users ADD COLUMN firebase_uid text UNIQUE;

-- Add partial unique index on email (lowercase, where not null)
CREATE UNIQUE INDEX users_email_unique_lower ON users (lower(email)) WHERE email IS NOT NULL;

-- Backfill firebase_uid for existing Google users (if any)
UPDATE users SET firebase_uid = provider_subject WHERE auth_provider = 'google' AND provider_subject IS NOT NULL;