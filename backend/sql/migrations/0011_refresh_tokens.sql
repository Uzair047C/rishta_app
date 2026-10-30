-- Add refresh_tokens table for rotating refresh token strategy
-- Migration is additive and idempotent

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'refresh_tokens'
  ) THEN
    CREATE TABLE refresh_tokens (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash      text NOT NULL,  -- bcrypt hash of the refresh token
      user_agent      text,
      ip              text,
      created_at      timestamptz NOT NULL DEFAULT now(),
      expires_at      timestamptz NOT NULL,
      revoked_at      timestamptz,
      replaced_by     uuid REFERENCES refresh_tokens(id) ON DELETE SET NULL,
      family_id       uuid DEFAULT gen_random_uuid()
    );
    CREATE INDEX refresh_tokens_user_id_idx ON refresh_tokens (user_id);
    CREATE INDEX refresh_tokens_expires_at_idx ON refresh_tokens (expires_at);
    CREATE UNIQUE INDEX refresh_tokens_token_hash_key ON refresh_tokens (token_hash);
    CREATE INDEX refresh_tokens_user_active_idx ON refresh_tokens (user_id) WHERE revoked_at IS NULL;
    CREATE INDEX refresh_tokens_family_idx ON refresh_tokens (family_id);
  ELSE
    -- Table exists, ensure columns and indexes
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'refresh_tokens' AND column_name = 'family_id'
    ) THEN
      ALTER TABLE refresh_tokens ADD COLUMN family_id uuid DEFAULT gen_random_uuid();
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE tablename = 'refresh_tokens' AND indexname = 'refresh_tokens_token_hash_key'
    ) THEN
      CREATE UNIQUE INDEX refresh_tokens_token_hash_key ON refresh_tokens (token_hash);
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE tablename = 'refresh_tokens' AND indexname = 'refresh_tokens_user_active_idx'
    ) THEN
      CREATE INDEX refresh_tokens_user_active_idx ON refresh_tokens (user_id) WHERE revoked_at IS NULL;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE tablename = 'refresh_tokens' AND indexname = 'refresh_tokens_family_idx'
    ) THEN
      CREATE INDEX refresh_tokens_family_idx ON refresh_tokens (family_id);
    END IF;
  END IF;
END
$$;