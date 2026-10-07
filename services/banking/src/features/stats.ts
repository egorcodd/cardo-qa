import { route, context } from "../../../../packages/shared/http.ts";
import { Router } from "express";
import type { Pool } from "pg";

export function createStatsRoutes(pool: Pool) {
  const app = Router();
  app.get(
    "/api/profile-stats",
    route(async (req, res) => {
      const row = (
        await pool.query(
          "SELECT count(*) FILTER (WHERE category='c.transfer' AND amount_minor<0)::int transfers FROM banking.transactions WHERE user_id=$1",
          [context(req)],
        )
      ).rows[0];
      res.json(row);
    }),
  );
  return app;
}
