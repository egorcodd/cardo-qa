import { Router } from "express";
import type { Pool, PoolClient } from "pg";
import { context, route } from "../../../../packages/shared/http.ts";
import { transaction } from "../../../../packages/shared/db.ts";
import { banks, resolveBank } from "../banks.ts";
async function catalog(
  database: Pick<Pool | PoolClient, "query">,
  userId: string,
) {
  const favorites = new Set(
    (
      await database.query(
        "SELECT bank_id FROM banking.bank_favorites WHERE user_id=$1",
        [userId],
      )
    ).rows.map((row) => row.bank_id),
  );
  return banks.map((bank) => ({ ...bank, favorite: favorites.has(bank.id) }));
}
export function createBanksRoutes(pool: Pool) {
  const app = Router();
  app.get(
    "/api/banks",
    route(async (req, res) => {
      res.json(await catalog(pool, context(req)));
    }),
  );
  for (const method of ["put", "delete"] as const) {
    app[method](
      "/api/banks/:bankId/favorite",
      route(async (req, res) => {
        const userId = context(req);
        const bank = resolveBank(req.params.bankId);
        const result = await transaction(pool, async (client) => {
          await client.query(
            "SELECT user_id FROM banking.workspaces WHERE user_id=$1 FOR UPDATE",
            [userId],
          );
          if (method === "put") {
            await client.query(
              "INSERT INTO banking.bank_favorites(user_id,bank_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
              [userId, bank.id],
            );
          } else {
            await client.query(
              "DELETE FROM banking.bank_favorites WHERE user_id=$1 AND bank_id=$2",
              [userId, bank.id],
            );
          }
          return catalog(client, userId);
        });
        res.json(result);
      }),
    );
  }
  return app;
}
