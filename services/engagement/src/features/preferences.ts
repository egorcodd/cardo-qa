import { Router } from "express";
import type { Pool, PoolClient } from "pg";
import { route, context, fail } from "../../../../packages/shared/http.ts";
import { transaction } from "../../../../packages/shared/db.ts";
import { updateOfferSchedule } from "../workers/offers.ts";

export async function preferences(c: Pool | PoolClient, user: string) {
  await c.query(
    "INSERT INTO engagement.notification_preferences(user_id) VALUES($1) ON CONFLICT DO NOTHING",
    [user],
  );
  return (await c.query(
    "SELECT transactions,service,offers FROM engagement.notification_preferences WHERE user_id=$1",
    [user],
  )).rows[0];
}
export function createPreferencesRoutes(pool: Pool) {
  const app = Router();
  app.get("/api/notifications/preferences", route(async (req, res) => {
    res.json(await preferences(pool, context(req)));
  }));
  app.patch("/api/notifications/preferences", route(async (req, res) => {
    const fields = ["transactions", "service", "offers"];
    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body) || !Object.keys(req.body).length || Object.keys(req.body).some((key) => !fields.includes(key) || typeof req.body[key] !== "boolean"))
      fail(422, "INVALID_PREFERENCES", "Выбери категории уведомлений");
    const result = await transaction(pool, async (c) => {
      const user = context(req);
      await preferences(c, user);
      const row = (await c.query(
        "UPDATE engagement.notification_preferences SET transactions=coalesce($2,transactions),service=coalesce($3,service),offers=coalesce($4,offers) WHERE user_id=$1 RETURNING transactions,service,offers",
        [user, req.body.transactions ?? null, req.body.service ?? null, req.body.offers ?? null],
      )).rows[0];
      if (req.body.offers !== undefined)
        await updateOfferSchedule(c, user, row.offers);
      await c.query(
        "DELETE FROM engagement.deliveries d USING engagement.notifications n WHERE d.notification_id=n.id AND n.user_id=$1 AND d.sent_at IS NULL AND CASE n.category WHEN 'transactions' THEN NOT $2 WHEN 'offers' THEN NOT $4 ELSE NOT $3 END",
        [user, row.transactions, row.service, row.offers],
      );
      return row;
    });
    res.json(result);
  }));
  return app;
}
