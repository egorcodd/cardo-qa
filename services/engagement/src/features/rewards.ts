import { route, context, fail } from "../../../../packages/shared/http.ts";
import { transaction } from "../../../../packages/shared/db.ts";
import { Router } from "express";
import type { Pool } from "pg";
import { rewards, ensure } from "../wallet.ts";
import { notification } from "../notifications.ts";
export function createRewardsRoutes(pool: Pool) {
  const app = Router();
  app.get(
    "/api/rewards",
    route(async (req, res) => {
      const user = context(req);
      await ensure(pool, user);
      const balance = (
        await pool.query(
          "SELECT points FROM engagement.wallets WHERE user_id=$1",
          [user],
        )
      ).rows[0].points;
      const claims = (
        await pool.query(
          "SELECT reward_id FROM engagement.redemptions WHERE user_id=$1",
          [user],
        )
      ).rows;
      res.json({
        balance,
        items: rewards.map((r) => ({
          ...r,
          claimed: claims.some((c) => c.reward_id === r.id),
        })),
      });
    }),
  );
  app.post(
    "/api/rewards/:id/claim",
    route(async (req, res) => {
      const user = context(req),
        reward = rewards.find((r) => r.id === req.params.id);
      if (!reward) fail(404, "REWARD_NOT_FOUND", "Награда не найдена");
      const result = await transaction(pool, async (c) => {
        await ensure(pool, user, c);
        const wallet = (
          await c.query(
            "SELECT points FROM engagement.wallets WHERE user_id=$1 FOR UPDATE",
            [user],
          )
        ).rows[0];
        if (
          (
            await c.query(
              "SELECT 1 FROM engagement.redemptions WHERE user_id=$1 AND reward_id=$2",
              [user, reward.id],
            )
          ).rowCount
        )
          fail(409, "ALREADY_CLAIMED", "Награда уже получена");
        if (wallet.points < reward.cost)
          fail(409, "NOT_ENOUGH_POINTS", "Недостаточно баллов");
        await c.query(
          "UPDATE engagement.wallets SET points=points-$2 WHERE user_id=$1",
          [user, reward.cost],
        );
        await c.query(
          "INSERT INTO engagement.redemptions(user_id,reward_id) VALUES($1,$2)",
          [user, reward.id],
        );
        await notification(
          c,
          user,
          "reward",
          "Награда получена",
          reward.title,
          "/rewards",
        );
        return { ok: true, balance: wallet.points - reward.cost };
      });
      res.json(result);
    }),
  );
  return app;
}
