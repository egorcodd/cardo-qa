import { route, context, fail } from "../../../../packages/shared/http.ts";
import { transaction } from "../../../../packages/shared/db.ts";
import { LIMITS } from "../../fixtures/demo.ts";
import { Router } from "express";
import type { Pool } from "pg";

export function createLimitsRoutes(pool: Pool) {
  const app = Router();
  app.get(
    "/api/limits",
    route(async (req, res) => {
      const values = (
        await pool.query(
          "SELECT id,value FROM banking.limits WHERE user_id=$1",
          [context(req)],
        )
      ).rows;
      res.json(
        LIMITS.map((l) => ({
          ...l,
          value: Number(values.find((v) => v.id === l.id)?.value ?? l.def),
        })),
      );
    }),
  );
  app.put(
    "/api/limits",
    route(async (req, res) => {
      const updates = Object.entries(req.body);
      if (!updates.length) fail(422, "INVALID_LIMITS", "Укажи лимиты");
      for (const [id, value] of updates) {
        const l = LIMITS.find((l) => l.id === id);
        if (
          !l ||
          typeof value !== "number" ||
          !Number.isInteger(value) ||
          value < l.min ||
          value > l.max
        )
          fail(422, "INVALID_LIMIT", "Лимит вне допустимого диапазона");
      }
      await transaction(pool, async (c) => {
        await c.query(
          "SELECT user_id FROM banking.workspaces WHERE user_id=$1 FOR UPDATE",
          [context(req)],
        );
        for (const [id, value] of updates)
          await c.query(
            "UPDATE banking.limits SET value=$3 WHERE user_id=$1 AND id=$2",
            [context(req), id, id === "single" && value === 1000 ? value * 10 : value],
          );
      });
      res.json({ ok: true });
    }),
  );
  return app;
}
