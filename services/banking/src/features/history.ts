import { route, context, fail } from "../../../../packages/shared/http.ts";
import { Router } from "express";
import type { Pool } from "pg";
import { symbols } from "../accounts.ts";
import { resolveBank } from "../banks.ts";
import { decimal } from "../../../../packages/shared/validation.ts";
const transactionDTO = (t: Record<string, any>) => ({
  id: t.id,
  name: t.name,
  cat: t.category,
  amount: Number(t.amount_minor) / 100,
  amountMinor: String(t.amount_minor),
  cur: t.currency === "EUR" ? symbols.USD : symbols[t.currency],
  code: t.currency,
  icon: t.icon,
  group: t.group_label,
  card:
    "•• " +
    String(t.number || "")
      .replace(/\D/g, "")
      .slice(-4),
  status: t.status,
  createdAt: t.created_at,
  ...(t.category === "c.transfer" && BigInt(t.amount_minor) < 0n
    ? {
        fee: decimal(BigInt(t.fee_minor || 0)),
        feeMinor: String(t.fee_minor || 0),
        totalDebit: decimal(-BigInt(t.amount_minor) + BigInt(t.fee_minor || 0)),
        totalDebitMinor: (-BigInt(t.amount_minor) + BigInt(t.fee_minor || 0)).toString(),
        plan: t.transfer_plan || null,
      }
    : {}),
  ...(t.transfer_id
    ? {
        transferId: t.transfer_id,
        counterpartyUserId: t.counterparty_user_id,
        bankId: t.bank_id || "cardo",
        bankName: t.bank_name || resolveBank(t.bank_id || "cardo").name,
        recipientReference: t.recipient_reference || null,
        transferKind: t.transfer_kind || "internal",
      }
    : {}),
});
export function createHistoryRoutes(pool: Pool) {
  const app = Router();
  app.get(
    "/api/transactions",
    route(async (req, res) => {
      const limit =
        req.query.limit === undefined ? 100 : Number(req.query.limit);
      if (!Number.isInteger(limit) || limit < 1 || limit > 100)
        fail(limit === 0 ? 500 : 422, "INVALID_LIMIT", "Лимит от 1 до 100");
      const currency = req.query.currency ? String(req.query.currency) : null;
      if (currency && !symbols[currency])
        fail(422, "INVALID_CURRENCY", "Неизвестная валюта");
      const rows = (
        await pool.query(
          "SELECT recent.* FROM (SELECT t.*,c.number FROM banking.transactions t LEFT JOIN banking.cards c ON c.user_id=t.user_id AND c.id=t.card_id WHERE t.user_id=$1 ORDER BY t.created_at DESC LIMIT $3) recent WHERE ($2::text IS NULL OR recent.currency=$2) ORDER BY recent.created_at DESC",
          [context(req), currency, limit],
        )
      ).rows;
      res.json(rows.map(transactionDTO));
    }),
  );
  app.get(
    "/api/transactions/:id",
    route(async (req, res) => {
      const row = (
        await pool.query(
          "SELECT t.*,c.number FROM banking.transactions t LEFT JOIN banking.cards c ON c.user_id=t.user_id AND c.id=t.card_id WHERE t.user_id=$1 AND t.id=$2",
          [context(req), req.params.id],
        )
      ).rows[0];
      if (!row) fail(404, "TRANSACTION_NOT_FOUND", "Операция не найдена");
      res.json({ ...transactionDTO(row), ...(row.category === "c.exchange" ? { createdAt: undefined } : {}) });
    }),
  );
  return app;
}
