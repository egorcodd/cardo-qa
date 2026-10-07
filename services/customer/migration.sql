CREATE TABLE IF NOT EXISTS customer.users (
 id uuid PRIMARY KEY, phone text UNIQUE NOT NULL, name text NOT NULL, password_hash text NOT NULL,
 language text NOT NULL DEFAULT 'ru' CHECK(language IN ('ru','en')),
 theme text NOT NULL DEFAULT 'system' CHECK(theme IN ('light','dark','system')),
 main_card_id text NOT NULL DEFAULT 'k1', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS customer.sessions (
 token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES customer.users(id), expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_user ON customer.sessions(user_id);
