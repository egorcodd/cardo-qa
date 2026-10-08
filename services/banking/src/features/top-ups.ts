import { Router } from "express";
import type { Pool } from "pg";
import { randomUUID, createHash } from "node:crypto";
import { route, context, fail } from "../../../../packages/shared/http.ts";
import { transaction } from "../../../../packages/shared/db.ts";
import { minor, decimal } from "../../../../packages/shared/validation.ts";
import type { DomainEvent } from "../../../../packages/contracts/index.ts";
export function createTopUpsRoutes(pool: Pool) {
  const app = Router();
  app.post(
    "/api/top-ups",
    route(async (req, res) => {
      const userId = context(req);
      const amount = minor(req.body.amount);
      const { cardId } = req.body;
      if (amount >= 100000000n)
        fail(422, "TOP_UP_LIMIT", "За одно пополнение можно внести до 1 000 000");
      if (typeof cardId !== "string")
        fail(422, "INVALID_CARD", "Выбери карту для пополнения");
      const key = req.header("Idempotency-Key") || req.body.idempotencyKey;
      if (typeof key !== "string" || !/^[\w-]{8,80}$/.test(key))
        fail(422, "IDEMPOTENCY_REQUIRED", "Нужен ключ операции");
      const hash = createHash("sha256")
        .update(JSON.stringify({ type: "top-up", cardId, amount: amount.toString() }))
        .digest("hex");
      const result = await transaction(pool, async (c) => {
        await c.query("SELECT user_id FROM banking.workspaces WHERE user_id=$1 FOR UPDATE", [userId]);
        const prior = (
          await c.query("SELECT * FROM banking.receipts WHERE user_id=$1 AND key=$2", [userId, key])
        ).rows[0];
        if (prior) {
          if (prior.payload_hash !== hash)
            fail(409, "IDEMPOTENCY_CONFLICT", "Ключ уже использован для другой операции");
          return prior.result;
        }
        const card = (
          await c.query(
            "SELECT c.*,a.currency,a.balance_minor FROM banking.cards c JOIN banking.accounts a ON a.user_id=c.user_id AND a.id=c.account_id WHERE c.user_id=$1 AND c.id=$2 FOR UPDATE OF c,a",
            [userId, cardId],
          )
        ).rows[0];
        if (!card) fail(404, "CARD_NOT_FOUND", "Карта не найдена");
        if (card.frozen) fail(409, "CARD_FROZEN", "Карта заморожена");
        const operationId = "tu" + randomUUID();
        const balance = BigInt(card.balance_minor) + amount;
        await c.query(
          "UPDATE banking.accounts SET balance_minor=$3 WHERE user_id=$1 AND id=$2",
          [userId, card.account_id, balance.toString()],
        );
        await c.query(
          "INSERT INTO banking.transactions(user_id,id,account_id,card_id,name,category,amount_minor,currency,icon,group_label) VALUES($1,$2,$3,$4,'Пополнение счёта','c.topup',$5,$6,'income','g.today')",
          [userId, operationId, card.account_id, cardId, amount.toString(), card.currency],
        );
        const receipt = {
          ok: true,
          operationId,
          status: "completed",
          amount: decimal(amount),
          balance: decimal(balance),
          currency: card.currency,
        };
        await c.query(
          "INSERT INTO banking.receipts(user_id,key,payload_hash,result) VALUES($1,$2,$3,$4)",
          [userId, key, hash, receipt],
        );
        const event: DomainEvent = {
          id: randomUUID(),
          type: "banking.top-up.completed",
          version: 1,
          userId,
          requestId: res.locals.requestId,
          occurredAt: new Date().toISOString(),
          payload: { operationId, amount: decimal(amount), currency: card.currency, balance: decimal(balance) },
        };
        await c.query("INSERT INTO banking.outbox(id,user_id,payload) VALUES($1,$2,$3)", [event.id, userId, event]);
        return receipt;
      });
      res.json(result);
    }),
  );
  return app;
}
