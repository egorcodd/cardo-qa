CREATE TABLE IF NOT EXISTS rates.snapshots(
 id text PRIMARY KEY, base text NOT NULL CHECK(base='RUB'), rub_per_unit_scaled jsonb NOT NULL,
 source text NOT NULL, published_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO rates.snapshots(id,base,rub_per_unit_scaled,source)
 VALUES('fixture-v1','RUB','{"RUB":"10000","USD":"925000","EUR":"991000","KZT":"1900"}','fixture')
 ON CONFLICT(id) DO NOTHING;
