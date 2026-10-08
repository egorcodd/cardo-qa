ALTER TABLE rates.snapshots ADD COLUMN IF NOT EXISTS effective_date date;
CREATE TABLE IF NOT EXISTS rates.sync_state(
 id boolean PRIMARY KEY DEFAULT true CHECK(id),
 attempted_at timestamptz NOT NULL,
 succeeded_at timestamptz,
 error_code text
);
GRANT SELECT ON rates.sync_state TO cardo_qa;
