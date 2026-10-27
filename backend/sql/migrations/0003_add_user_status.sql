-- Migration 0003: Add user status column

-- Add status column to users table
ALTER TABLE users ADD COLUMN status text NOT NULL DEFAULT 'active'
  CHECK (status IN ('active', 'suspended', 'banned'));

-- Create index for status lookups
CREATE INDEX users_status_idx ON users (status);