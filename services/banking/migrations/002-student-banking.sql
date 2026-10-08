ALTER TABLE banking.workspaces ADD COLUMN IF NOT EXISTS demo boolean NOT NULL DEFAULT false;
ALTER TABLE banking.recipients ADD COLUMN IF NOT EXISTS target_user_id uuid;
ALTER TABLE banking.recipients ADD COLUMN IF NOT EXISTS target_account_id text;
ALTER TABLE banking.recipients ADD COLUMN IF NOT EXISTS target_card_id text;
ALTER TABLE banking.recipients ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'legacy';
ALTER TABLE banking.recipients ADD COLUMN IF NOT EXISTS lookup_type text;
ALTER TABLE banking.recipients ADD COLUMN IF NOT EXISTS lookup_value text;
ALTER TABLE banking.recipients ADD CONSTRAINT recipients_target_account FOREIGN KEY(target_user_id,target_account_id) REFERENCES banking.accounts(user_id,id);
ALTER TABLE banking.recipients ADD CONSTRAINT recipients_target_card FOREIGN KEY(target_user_id,target_card_id) REFERENCES banking.cards(user_id,id);
ALTER TABLE banking.recipients ADD CONSTRAINT recipients_registered_target CHECK(kind='legacy' OR (kind='registered' AND target_user_id IS NOT NULL AND target_account_id IS NOT NULL AND target_card_id IS NOT NULL AND lookup_type IN ('phone','card') AND lookup_value IS NOT NULL));
CREATE SEQUENCE IF NOT EXISTS banking.card_number_seq START WITH 100000000000 MAXVALUE 999999999999;
CREATE OR REPLACE FUNCTION banking.next_card_number() RETURNS text LANGUAGE plpgsql AS $$
DECLARE candidate text;
BEGIN
 LOOP
  candidate := '9999' || lpad(nextval('banking.card_number_seq')::text,12,'0');
  IF NOT EXISTS(SELECT 1 FROM banking.cards WHERE regexp_replace(number,'[^0-9]','','g')=candidate) THEN
   RETURN substring(candidate,1,4) || ' ' || substring(candidate,5,4) || ' ' || substring(candidate,9,4) || ' ' || substring(candidate,13,4);
  END IF;
 END LOOP;
END
$$;
DO $$
DECLARE duplicate record;
BEGIN
 FOR duplicate IN
  SELECT user_id,id FROM (
   SELECT user_id,id,row_number() OVER(PARTITION BY regexp_replace(number,'[^0-9]','','g') ORDER BY created_at,user_id,id) ordinal FROM banking.cards
  ) numbers WHERE ordinal>1
 LOOP
  UPDATE banking.cards SET number=banking.next_card_number() WHERE user_id=duplicate.user_id AND id=duplicate.id;
 END LOOP;
END
$$;
CREATE UNIQUE INDEX cards_number_unique ON banking.cards((regexp_replace(number,'[^0-9]','','g')));
ALTER TABLE banking.transactions ADD COLUMN IF NOT EXISTS transfer_id text;
ALTER TABLE banking.transactions ADD COLUMN IF NOT EXISTS counterparty_user_id uuid;
ALTER TABLE banking.transactions ADD COLUMN IF NOT EXISTS counterpart_operation_id text;
ALTER TABLE banking.transactions ADD CONSTRAINT transactions_counterpart FOREIGN KEY(counterparty_user_id,counterpart_operation_id) REFERENCES banking.transactions(user_id,id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX transactions_transfer ON banking.transactions(transfer_id) WHERE transfer_id IS NOT NULL;
