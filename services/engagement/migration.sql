CREATE TABLE IF NOT EXISTS engagement.wallets(user_id uuid PRIMARY KEY,points integer NOT NULL DEFAULT 100 CHECK(points>=0));
CREATE TABLE IF NOT EXISTS engagement.inbox(event_id uuid PRIMARY KEY,received_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS engagement.redemptions(user_id uuid NOT NULL,reward_id text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(user_id,reward_id));
CREATE TABLE IF NOT EXISTS engagement.notifications(id uuid PRIMARY KEY,user_id uuid NOT NULL,kind text NOT NULL,title text NOT NULL,body text NOT NULL,url text NOT NULL,read_at timestamptz,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS notifications_user ON engagement.notifications(user_id,created_at DESC);
CREATE TABLE IF NOT EXISTS engagement.subscriptions(id uuid PRIMARY KEY,user_id uuid NOT NULL,endpoint text NOT NULL,payload jsonb NOT NULL,language text NOT NULL DEFAULT 'ru',created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(user_id,endpoint));
CREATE TABLE IF NOT EXISTS engagement.deliveries(id uuid PRIMARY KEY,notification_id uuid NOT NULL REFERENCES engagement.notifications(id) ON DELETE CASCADE,subscription_id uuid NOT NULL REFERENCES engagement.subscriptions(id) ON DELETE CASCADE,attempts integer NOT NULL DEFAULT 0,next_attempt_at timestamptz NOT NULL DEFAULT now(),sent_at timestamptz,last_error text,UNIQUE(notification_id,subscription_id));
CREATE TABLE IF NOT EXISTS engagement.config(key text PRIMARY KEY,value jsonb NOT NULL);
