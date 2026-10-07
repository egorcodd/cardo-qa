import { Router } from "express";
import type { Pool } from "pg";
import { randomUUID, createHash } from "node:crypto";
import { route, context, fail } from "../../../../packages/shared/http.ts";
import { transaction } from "../../../../packages/shared/db.ts";
import { minor, decimal } from "../../../../packages/shared/validation.ts";
import {
  currencies,
  type Currency,
  type RatesClient,
} from "../../../../packages/contracts/index.ts";
export function createExchangeRoutes(pool: Pool, rates: RatesClient) {
  const app = Router();
  app.post(
    "/api/exchange",
    route(async (req, res) => {
      const user = context(req),
        amount = minor(req.body.amount),
        { from, to } = req.body;
      if (
        typeof from !== "string" ||
        typeof to !== "string" ||
        !currencies.includes(from as Currency) ||
        !currencies.includes(to as Currency) ||
        from === to
      )
        fail(422, "INVALID_CURRENCY", "Выбери две разные валюты счёта");
      const key = req.header("Idempotency-Key");
      if (!key || !/^ex-[\w-]{8,80}$/.test(key))
        fail(422, "IDEMPOTENCY_REQUIRED", "Нужен ключ обмена");
      const hash = createHash("sha256")
        .update(JSON.stringify({ from, to, amount: amount.toString() }))
        .digest("hex");
      const saved = (
        await pool.query(
          "SELECT payload_hash,result FROM banking.receipts WHERE user_id=$1 AND key=$2",
          [user, key],
        )
      ).rows[0];
      if (saved) {
        if (saved.payload_hash !== hash)
          fail(
            409,
            "IDEMPOTENCY_CONFLICT",
            "Ключ уже использован для другого обмена",
          );
        res.json(saved.result);
        return;
      }
      const quote = await rates.quote(
        from as Currency,
        to as Currency,
        res.locals.requestId,
      );
      const numerator = BigInt(quote.numerator),
        denominator = BigInt(quote.denominator);
      const result = await transaction(pool, async (c) => {
        await c.query(
          "SELECT user_id FROM banking.workspaces WHERE user_id=$1 FOR UPDATE",
          [user],
        );
        const prior = (
          await c.query(
            "SELECT * FROM banking.receipts WHERE user_id=$1 AND key=$2",
            [user, key],
          )
        ).rows[0];
        if (prior) {
          if (prior.payload_hash !== hash)
            fail(
              409,
              "IDEMPOTENCY_CONFLICT",
              "Ключ уже использован для другого обмена",
            );
          return prior.result;
        }
        const rows = (
          await c.query(
            "SELECT * FROM banking.accounts WHERE user_id=$1 AND currency IN ($2,$3) ORDER BY id FOR UPDATE",
            [user, from, to],
          )
        ).rows;
        const source = rows.find((a) => a.currency === from),
          target = rows.find((a) => a.currency === to);
        if (!source || !target)
          fail(404, "ACCOUNT_NOT_FOUND", "Счёт не найден");
        if (BigInt(source.balance_minor) < amount)
          fail(409, "INSUFFICIENT_FUNDS", "Недостаточно денег");
        const received = (amount * numerator + denominator / 2n) / denominator;
        if (received < 1n)
          fail(422, "AMOUNT_TOO_SMALL", "Сумма слишком мала для обмена");
        const id = "ex" + randomUUID();
        for (const [account, delta, icon] of [
          [source, -amount, "expense"],
          [target, received, "income"],
        ] as const) {
          await c.query(
            "UPDATE banking.accounts SET balance_minor=balance_minor+$3 WHERE user_id=$1 AND id=$2",
            [user, account.id, delta.toString()],
          );
          const card = (
            await c.query(
              "SELECT id FROM banking.cards WHERE user_id=$1 AND account_id=$2 ORDER BY created_at,id LIMIT 1",
              [user, account.id],
            )
          ).rows[0];
          await c.query(
            "INSERT INTO banking.transactions(user_id,id,account_id,card_id,name,category,amount_minor,currency,icon,group_label) VALUES($1,$2,$3,$4,$5,'c.exchange',$6,$7,$8,'g.today')",
            [
              user,
              id + "-" + account.currency,
              account.id,
              card?.id,
              "Обмен " + from + " → " + to,
              delta.toString(),
              account.currency,
              icon,
            ],
          );
        }
        const receipt = {
          ok: true,
          id,
          from,
          to,
          amount: decimal(amount),
          received: decimal(received),
          rate: Number(numerator) / Number(denominator),
          rateVersion: quote.version,
          createdAt: new Date().toISOString(),
        };
        await c.query(
          "INSERT INTO banking.receipts(user_id,key,payload_hash,result) VALUES($1,$2,$3,$4)",
          [user, key, hash, receipt],
        );
        return receipt;
      });
      res.json(result);
    }),
  );

  return app;
}
