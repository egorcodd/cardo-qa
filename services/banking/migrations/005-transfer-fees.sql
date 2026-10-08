ALTER TABLE banking.transactions ADD COLUMN IF NOT EXISTS fee_minor bigint NOT NULL DEFAULT 0 CHECK(fee_minor>=0);
ALTER TABLE banking.transactions ADD COLUMN IF NOT EXISTS transfer_plan text CHECK(transfer_plan IN ('standard','plus'));
