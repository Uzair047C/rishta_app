-- Migration 0015: SLA deadlines on moderation queues
-- Scaling plan §6 "Report SLAs": review within 24h; default covers every
-- insert path (reports, automated flags, future ones) at the DB level.

ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS sla_deadline timestamptz NOT NULL DEFAULT now() + interval '24 hours';

ALTER TABLE moderation_flags
  ADD COLUMN IF NOT EXISTS sla_deadline timestamptz NOT NULL DEFAULT now() + interval '24 hours';

-- Partial indexes for the breach check the worker runs hourly.
CREATE INDEX IF NOT EXISTS reports_sla_breach_idx
  ON reports (sla_deadline) WHERE status IN ('open', 'reviewing');

CREATE INDEX IF NOT EXISTS moderation_flags_sla_breach_idx
  ON moderation_flags (sla_deadline) WHERE status IN ('open', 'reviewing');
