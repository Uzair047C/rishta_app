-- Migration 0004: Add admin flag to users and review columns to moderation/reports

-- Add is_admin column to users table
ALTER TABLE users ADD COLUMN is_admin boolean NOT NULL DEFAULT false;

-- Add reviewed_by and reviewed_at to moderation_flags
ALTER TABLE moderation_flags ADD COLUMN reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE moderation_flags ADD COLUMN reviewed_at timestamptz;

-- Add resolved_by and resolved_at to reports
ALTER TABLE reports ADD COLUMN resolved_by uuid REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE reports ADD COLUMN resolved_at timestamptz;