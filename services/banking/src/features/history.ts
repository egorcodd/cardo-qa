import { route, context, fail } from "../../../../packages/shared/http.ts";
import { Router } from "express";
import type { Pool } from "pg";
import { symbols } from "../accounts.ts";
export function createHistoryRoutes(pool: Pool) {
  const app = Router();
  app.get(
    "/api/transactions",
    route(async (req, res) => {
      const limit =
        req.query.limit === undefined ? 100 : Number(req.query.limit);
      if (!Number.isInteger(limit) || limit < 1 || limit > 100)
        fail(422, "INVALID_LIMIT", "Лимит от 1 до 100");
      const currency = req.query.currency ? String(req.query.currency) : null;
      if (currency && !symbols[currency])
        fail(422, "INVALID_CURRENCY", "Неизвестная валюта");
      const rows = (
        await pool.query(
          "SELECT t.*,c.number FROM banking.transactions t LEFT JOIN banking.cards c ON c.user_id=t.user_id AND c.id=t.card_id WHERE t.user_id=$1 AND ($2::text IS NULL OR t.currency=$2) ORDER BY t.created_at DESC LIMIT $3",
          [context(req), currency, limit],
        )
      ).rows;
      res.json(
        rows.map((t) => ({
          id: t.id,
          name: t.name,
          cat: t.category,
          amount: Number(t.amount_minor) / 100,
          amountMinor: String(t.amount_minor),
          cur: symbols[t.currency],
          code: t.currency,
          icon: t.icon,
          group: t.group_label,
          card:
            "•• " +
            String(t.number || "")
              .replace(/ /g, "")
              .slice(-4),
          status: t.status,
          createdAt: t.created_at,
        })),
      );
    }),
  );
  return app;
}
