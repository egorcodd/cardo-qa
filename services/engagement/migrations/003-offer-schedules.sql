CREATE TABLE IF NOT EXISTS engagement.offer_schedules(user_id uuid PRIMARY KEY REFERENCES engagement.notification_preferences(user_id) ON DELETE CASCADE,next_offer_at timestamptz,last_sent_at timestamptz,sequence bigint NOT NULL DEFAULT 0 CHECK(sequence>=0));
CREATE INDEX IF NOT EXISTS offer_schedules_due ON engagement.offer_schedules(next_offer_at) WHERE next_offer_at IS NOT NULL;
INSERT INTO engagement.offer_schedules(user_id,next_offer_at) SELECT user_id,now()+interval '4 hours' FROM engagement.notification_preferences WHERE offers ON CONFLICT DO NOTHING;
