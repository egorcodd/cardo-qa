CREATE TABLE IF NOT EXISTS engagement.notification_outbox (
  id uuid PRIMARY KEY,
  notification_id uuid NOT NULL UNIQUE REFERENCES engagement.notifications(id) ON DELETE CASCADE,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  last_error text
);
CREATE INDEX IF NOT EXISTS notification_outbox_pending ON engagement.notification_outbox(next_attempt_at,created_at) WHERE delivered_at IS NULL;
