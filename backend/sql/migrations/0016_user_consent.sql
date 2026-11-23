-- Migration 0016: Terms/Privacy consent records
-- One row per accepted document per user; the app sends the client-captured
-- timestamp at login and the server stores it (server adds received_at).

CREATE TABLE IF NOT EXISTS user_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  document text NOT NULL CHECK (document IN ('terms', 'privacy')),
  accepted_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, document)
);

CREATE INDEX IF NOT EXISTS user_consents_user_idx ON user_consents (user_id);
