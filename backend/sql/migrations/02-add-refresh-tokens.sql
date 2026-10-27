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
      replaced_by     uuid REFERENCES refresh_tokens(id) ON DELETE SET NULL
    );
    CREATE INDEX refresh_tokens_user_id_idx ON refresh_tokens (user_id);
    CREATE INDEX refresh_tokens_expires_at_idx ON refresh_tokens (expires_at);
  END IF;
END
$$;