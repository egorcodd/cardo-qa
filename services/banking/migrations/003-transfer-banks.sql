ALTER TABLE banking.recipients ADD COLUMN IF NOT EXISTS bank_id text NOT NULL DEFAULT 'cardo';
ALTER TABLE banking.recipients DROP CONSTRAINT recipients_registered_target;
ALTER TABLE banking.recipients ADD CONSTRAINT recipients_registered_target CHECK(
 kind='legacy' OR
 (kind='registered' AND bank_id='cardo' AND target_user_id IS NOT NULL AND target_account_id IS NOT NULL AND target_card_id IS NOT NULL AND lookup_type IN ('phone','card') AND lookup_value IS NOT NULL) OR
 (kind='external' AND bank_id<>'cardo' AND target_user_id IS NULL AND target_account_id IS NULL AND target_card_id IS NULL AND lookup_type IN ('phone','card') AND lookup_value IS NOT NULL)
);
ALTER TABLE banking.transactions ADD COLUMN IF NOT EXISTS bank_id text;
ALTER TABLE banking.transactions ADD COLUMN IF NOT EXISTS bank_name text;
ALTER TABLE banking.transactions ADD COLUMN IF NOT EXISTS recipient_reference text;
ALTER TABLE banking.transactions ADD COLUMN IF NOT EXISTS transfer_kind text CHECK(transfer_kind IN ('internal','external'));
