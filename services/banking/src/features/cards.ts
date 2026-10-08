import { route, context, fail } from "../../../../packages/shared/http.ts";
import { Router } from "express";
import type { Pool } from "pg";
import { cardDTO } from "../accounts.ts";
export function createCardsRoutes(pool: Pool) {
  const app = Router();
  app.get(
    "/api/cards",
    route(async (req, res) => {
      const rows = (
        await pool.query(
          "SELECT c.*,a.currency,a.balance_minor FROM banking.cards c JOIN banking.accounts a ON a.user_id=c.user_id AND a.id=c.account_id WHERE c.user_id=$1 ORDER BY c.created_at,c.id",
          [context(req)],
        )
      ).rows;
      res.json(rows.map(cardDTO));
    }),
  );
  app.get(
    "/api/cards/:id/requisites",
    route(async (req, res) => {
      const c = (
        await pool.query(
          "SELECT c.*,a.currency FROM banking.cards c JOIN banking.accounts a ON a.user_id=c.user_id AND a.id=c.account_id WHERE c.user_id=$1 AND c.id=$2",
          [context(req), req.params.id],
        )
      ).rows[0];
      if (!c) fail(404, "CARD_NOT_FOUND", "Карта не найдена");
      res.json({
        number: c.number,
        exp: c.expiry,
        cvc: c.cvc,
        holder: c.holder,
        account:
          "40817 " +
          c.currency +
          " " +
          c.account_id +
          " " +
          c.user_id.replace(/-/g, "").slice(0, 12),
      });
    }),
  );
  app.post(
    "/api/cards/:id/freeze",
    route(async (req, res) => {
      if (req.body.frozen !== undefined && typeof req.body.frozen !== "boolean")
        fail(422, "INVALID_STATE", "Некорректное состояние карты");
      const c = (
        await pool.query(
          "UPDATE banking.cards SET frozen=coalesce($3,NOT frozen) WHERE user_id=$1 AND id=$2 RETURNING *",
          [context(req), req.params.id, req.body.frozen ?? null],
        )
      ).rows[0];
      if (!c) fail(404, "CARD_NOT_FOUND", "Карта не найдена");
      res.json({ id: c.id, frozen: c.frozen });
    }),
  );
  return app;
}
