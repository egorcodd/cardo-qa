import { route, context } from "../../../../packages/shared/http.ts";
import { Router } from "express";
import type { Pool } from "pg";

export function createContactsRoutes(pool: Pool) {
  const app = Router();
  app.get(
    "/api/contacts",
    route(async (req, res) => {
      const rows = (
        await pool.query(
          "SELECT * FROM banking.recipients WHERE user_id=$1 ORDER BY id",
          [context(req)],
        )
      ).rows;
      res.json(
        rows.map((r) => ({
          id: r.id,
          name: r.name,
          acct: r.account,
          initial: r.initial,
          tone: r.tone,
          img: r.image,
        })),
      );
    }),
  );
  return app;
}
