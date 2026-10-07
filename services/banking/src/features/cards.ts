import { randomUUID, randomInt } from "node:crypto";
import { route, context, fail } from "../../../../packages/shared/http.ts";
import { transaction } from "../../../../packages/shared/db.ts";
import { Router } from "express";
import type { Pool } from "pg";
import { symbols, cardDTO } from "../accounts.ts";
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
  app.post(
    "/api/cards",
    route(async (req, res) => {
      const u = context(req);
      const currency = req.body.currency || "RUB";
      const tone = req.body.tone || "lime";
      if (
        !Object.keys(symbols).includes(currency) ||
        !["lime", "dark", "light"].includes(tone)
      )
        fail(422, "INVALID_CARD", "Выбери валюту и оформление");
      const result = await transaction(pool, async (c) => {
        await c.query(
          "SELECT user_id FROM banking.workspaces WHERE user_id=$1 FOR UPDATE",
          [u],
        );
        const count = Number(
          (
            await c.query(
              "SELECT count(*) FROM banking.cards WHERE user_id=$1",
              [u],
            )
          ).rows[0].count,
        );
        if (count >= 10) fail(409, "CARD_LIMIT", "Можно выпустить до 10 карт");
        const account = (
          await c.query(
            "SELECT * FROM banking.accounts WHERE user_id=$1 AND currency=$2",
            [u, currency],
          )
        ).rows[0];
        const id = "k" + randomUUID();
        const digits =
          "9999 " +
          String(randomInt(1000, 10000)) +
          " " +
          String(randomInt(1000, 10000)) +
          " " +
          String(randomInt(1000, 10000));
        const exp = new Date();
        exp.setFullYear(exp.getFullYear() + 3);
        const row = (
          await c.query(
            "INSERT INTO banking.cards(user_id,id,account_id,number,expiry,cvc,holder,tone) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",
            [
              u,
              id,
              account.id,
              digits,
              String(exp.getMonth() + 1).padStart(2, "0") +
                "/" +
                String(exp.getFullYear()).slice(-2),
              String(randomInt(100, 1000)),
              decodeURIComponent(req.header("X-User-Name") || "Клиент Cardo"),
              tone,
            ],
          )
        ).rows[0];
        return cardDTO({
          ...row,
          ...{ currency, balance_minor: account.balance_minor },
        });
      });
      res.status(201).json(result);
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
