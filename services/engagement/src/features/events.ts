import { route, fail } from "../../../../packages/shared/http.ts";
import { transaction } from "../../../../packages/shared/db.ts";
import type { DomainEvent } from "../../../../packages/contracts/index.ts";
import { Router } from "express";
import type { Pool } from "pg";
import { ensure } from "../wallet.ts";
import { notification } from "../notifications.ts";
export function createEventsRoutes(pool: Pool) {
  const app = Router();
  app.post(
    "/internal/events",
    route(async (req, res) => {
      const e = req.body as DomainEvent;
      if (
        !e ||
        e.type !== "banking.transfer.completed" ||
        e.version !== 1 ||
        !/^[0-9a-f-]{36}$/.test(e.id) ||
        !/^[0-9a-f-]{36}$/.test(e.userId) ||
        !e.payload?.transferId
      )
        fail(422, "INVALID_EVENT", "Некорректное событие");
      await transaction(pool, async (c) => {
        const inserted = await c.query(
          "INSERT INTO engagement.inbox(event_id) VALUES($1) ON CONFLICT DO NOTHING RETURNING event_id",
          [e.id],
        );
        if (!inserted.rowCount) return;
        await ensure(pool, e.userId, c);
        await c.query(
          "UPDATE engagement.wallets SET points=points+5 WHERE user_id=$1",
          [e.userId],
        );
        await notification(
          c,
          e.userId,
          "transfer",
          "Перевод выполнен",
          e.payload.amount +
            " " +
            e.payload.currency +
            " · " +
            e.payload.recipient,
          "/history/" + e.payload.transferId,
        );
      });
      res.json({ ok: true });
    }),
  );
  return app;
}
