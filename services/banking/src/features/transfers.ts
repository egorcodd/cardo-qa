import { randomUUID, createHash } from "node:crypto";
import { route, context, fail } from "../../../../packages/shared/http.ts";
import { transaction } from "../../../../packages/shared/db.ts";
import { minor, decimal } from "../../../../packages/shared/validation.ts";
import type { DomainEvent } from "../../../../packages/contracts/index.ts";
import { Router } from "express";
import type { Pool } from "pg";

export function createTransfersRoutes(pool: Pool) {
  const app = Router();
  app.post(
    "/api/transfer",
    route(async (req, res) => {
      const u = context(req);
      const amount = minor(req.body.amount);
      const { cardId, recipientId } = req.body;
      const key = req.header("Idempotency-Key") || req.body.idempotencyKey;
      if (typeof key !== "string" || !/^[\w-]{8,80}$/.test(key))
        fail(422, "IDEMPOTENCY_REQUIRED", "Нужен ключ операции");
      if (typeof cardId !== "string" || typeof recipientId !== "string")
        fail(422, "INVALID_TRANSFER", "Выбери карту и получателя");
      const hash = createHash("sha256")
        .update(
          JSON.stringify({ cardId, recipientId, amount: amount.toString() }),
        )
        .digest("hex");
      const result = await transaction(pool, async (c) => {
        await c.query(
          "SELECT user_id FROM banking.workspaces WHERE user_id=$1 FOR UPDATE",
          [u],
        );
        const prior = (
          await c.query(
            "SELECT * FROM banking.receipts WHERE user_id=$1 AND key=$2",
            [u, key],
          )
        ).rows[0];
        if (prior) {
          if (prior.payload_hash !== hash)
            fail(
              409,
              "IDEMPOTENCY_CONFLICT",
              "Ключ уже использован для другой операции",
            );
          return prior.result;
        }
        const card = (
          await c.query(
            "SELECT c.*,a.currency,a.balance_minor FROM banking.cards c JOIN banking.accounts a ON a.user_id=c.user_id AND a.id=c.account_id WHERE c.user_id=$1 AND c.id=$2 FOR UPDATE OF c,a",
            [u, cardId],
          )
        ).rows[0];
        const recipient = (
          await c.query(
            "SELECT * FROM banking.recipients WHERE user_id=$1 AND id=$2",
            [u, recipientId],
          )
        ).rows[0];
        if (!card || !recipient)
          fail(404, "NOT_FOUND", "Карта или получатель не найдены");
        if (card.frozen) fail(409, "CARD_FROZEN", "Карта заморожена");
        if (BigInt(card.balance_minor) < amount)
          fail(409, "INSUFFICIENT_FUNDS", "Недостаточно денег");
        const limits = (
          await c.query(
            "SELECT id,value FROM banking.limits WHERE user_id=$1",
            [u],
          )
        ).rows;
        const single =
          BigInt(limits.find((l) => l.id === "single").value) * 100n;
        const daily =
          BigInt(limits.find((l) => l.id === "transfer").value) * 100n;
        const spent = BigInt(
          (
            await c.query(
              "SELECT coalesce(sum(-amount_minor),0)::text total FROM banking.transactions WHERE user_id=$1 AND recipient_id IS NOT NULL AND currency=$2 AND created_at>=date_trunc('day',now())",
              [u, card.currency],
            )
          ).rows[0].total,
        );
        if (amount > single || spent + amount > daily)
          fail(409, "LIMIT_EXCEEDED", "Превышен лимит переводов");
        const id = "n" + randomUUID(),
          balance = BigInt(card.balance_minor) - amount;
        await c.query(
          "UPDATE banking.accounts SET balance_minor=$3 WHERE user_id=$1 AND id=$2",
          [u, card.account_id, balance.toString()],
        );
        await c.query(
          "INSERT INTO banking.transactions(user_id,id,account_id,card_id,name,category,amount_minor,currency,icon,group_label,recipient_id) VALUES($1,$2,$3,$4,$5,'c.transfer',$6,$7,'send','g.today',$8)",
          [
            u,
            id,
            card.account_id,
            cardId,
            recipient.name,
            (-amount).toString(),
            card.currency,
            recipientId,
          ],
        );
        const receipt = {
          ok: true,
          transferId: id,
          status: "completed",
          amount: decimal(amount),
          balance: decimal(balance),
          currency: card.currency,
        };
        await c.query(
          "INSERT INTO banking.receipts(user_id,key,payload_hash,result) VALUES($1,$2,$3,$4)",
          [u, key, hash, receipt],
        );
        const event: DomainEvent = {
          id: randomUUID(),
          type: "banking.transfer.completed",
          version: 1,
          userId: u,
          requestId: res.locals.requestId,
          occurredAt: new Date().toISOString(),
          payload: {
            transferId: id,
            amount: decimal(amount),
            currency: card.currency,
            recipient: recipient.name,
          },
        };
        await c.query(
          "INSERT INTO banking.outbox(id,user_id,payload) VALUES($1,$2,$3)",
          [event.id, u, event],
        );
        return receipt;
      });
      res.json(result);
    }),
  );
  return app;
}
