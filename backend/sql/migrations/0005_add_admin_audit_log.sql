-- Migration 0005: Add admin audit log table

CREATE TABLE admin_audit_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action          text NOT NULL,
  target_type     text NOT NULL,
  target_id       uuid,
  details         jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX admin_audit_log_admin_idx ON admin_audit_log (admin_id, created_at DESC);
CREATE INDEX admin_audit_log_target_idx ON admin_audit_log (target_type, target_id);