CREATE TABLE telemetry.events (
  id text PRIMARY KEY,
  topic text NOT NULL,
  event_id text,
  source_partition integer,
  source_offset text,
  occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  kafka_observed_at timestamptz,
  origin text NOT NULL CHECK(origin IN ('live','recovered')),
  payload jsonb NOT NULL,
  payload_hash text NOT NULL,
  state text NOT NULL CHECK(state IN ('pending','indexed','quarantine')),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  indexed_at timestamptz,
  last_code text
);
CREATE INDEX events_pending ON telemetry.events(next_attempt_at) WHERE state='pending';
CREATE INDEX events_time ON telemetry.events(occurred_at);
CREATE VIEW telemetry.pipeline AS
SELECT topic, count(*) FILTER(WHERE state='pending')::int AS pending,
  count(*) FILTER(WHERE state='quarantine')::int AS quarantined,
  count(*) FILTER(WHERE origin='recovered')::int AS recovered,
  max(kafka_observed_at) AS last_observed_at,
  min(received_at) FILTER(WHERE state='pending') AS oldest_pending_at
FROM telemetry.events GROUP BY topic;
