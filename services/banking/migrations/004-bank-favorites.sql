CREATE TABLE banking.bank_favorites(
 user_id uuid NOT NULL REFERENCES banking.workspaces(user_id) ON DELETE CASCADE,
 bank_id text NOT NULL CHECK(bank_id ~ '^[a-z][a-z0-9-]{0,39}$'),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,bank_id)
);
GRANT SELECT ON banking.bank_favorites TO cardo_qa;
INSERT INTO banking.bank_favorites(user_id,bank_id)
SELECT user_id,'cardo' FROM banking.workspaces ON CONFLICT DO NOTHING;
