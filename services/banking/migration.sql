CREATE TABLE IF NOT EXISTS banking.workspaces(user_id uuid PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS banking.accounts(
 user_id uuid NOT NULL, id text NOT NULL, currency text NOT NULL CHECK(currency IN ('RUB','USD','EUR')),
 balance_minor bigint NOT NULL CHECK(balance_minor>=0), opening_balance_minor bigint NOT NULL,
 PRIMARY KEY(user_id,id), UNIQUE(user_id,currency), FOREIGN KEY(user_id) REFERENCES banking.workspaces(user_id)
);
CREATE TABLE IF NOT EXISTS banking.cards(
 user_id uuid NOT NULL, id text NOT NULL, account_id text NOT NULL, number text NOT NULL, expiry text NOT NULL,
 cvc text NOT NULL, holder text NOT NULL, tone text NOT NULL, frozen boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,id),
 FOREIGN KEY(user_id,account_id) REFERENCES banking.accounts(user_id,id)
);
CREATE TABLE IF NOT EXISTS banking.recipients(user_id uuid NOT NULL,id text NOT NULL,name text NOT NULL,account text NOT NULL,initial text NOT NULL,tone text NOT NULL,image text,PRIMARY KEY(user_id,id),FOREIGN KEY(user_id) REFERENCES banking.workspaces(user_id));
CREATE TABLE IF NOT EXISTS banking.limits(user_id uuid NOT NULL,id text NOT NULL,value bigint NOT NULL CHECK(value>=0),PRIMARY KEY(user_id,id),FOREIGN KEY(user_id) REFERENCES banking.workspaces(user_id));
CREATE TABLE IF NOT EXISTS banking.transactions(
 user_id uuid NOT NULL,id text NOT NULL,account_id text NOT NULL,card_id text,name text NOT NULL,category text NOT NULL,
 amount_minor bigint NOT NULL,currency text NOT NULL,icon text NOT NULL,group_label text NOT NULL,
 recipient_id text,status text NOT NULL DEFAULT 'completed',created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,id), FOREIGN KEY(user_id,account_id) REFERENCES banking.accounts(user_id,id)
);
CREATE INDEX IF NOT EXISTS transactions_history ON banking.transactions(user_id,created_at DESC);
CREATE TABLE IF NOT EXISTS banking.receipts(user_id uuid NOT NULL,key text NOT NULL,payload_hash text NOT NULL,result jsonb NOT NULL,PRIMARY KEY(user_id,key));
CREATE TABLE IF NOT EXISTS banking.outbox(
 id uuid PRIMARY KEY,user_id uuid NOT NULL,payload jsonb NOT NULL,attempts integer NOT NULL DEFAULT 0,
 next_attempt_at timestamptz NOT NULL DEFAULT now(),delivered_at timestamptz,last_error text,created_at timestamptz NOT NULL DEFAULT now()
);
