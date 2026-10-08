import { route, context, fail } from "../../../../packages/shared/http.ts";
import { transaction } from "../../../../packages/shared/db.ts";
import { Router } from "express";
import type { Pool } from "pg";
import { notification } from "../notifications.ts";
export function createNotificationsRoutes(pool: Pool) {
  const app = Router();
  app.get(
    "/api/notifications",
    route(async (req, res) => {
      const list = (
        await pool.query(
          "SELECT id,kind,title,body,url,read_at,created_at FROM engagement.notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100",
          [context(req)],
        )
      ).rows;
      res.json(list.map((n) => ({ ...n, read: !!n.read_at })));
    }),
  );
  app.patch(
    "/api/notifications/:id/read",
    route(async (req, res) => {
      const result = await pool.query(
        "UPDATE engagement.notifications SET read_at=coalesce(read_at,now()) WHERE user_id=$1 AND id=$2 AND read_at IS NULL RETURNING id",
        [context(req), req.params.id],
      );
      if (!result.rowCount) fail(404, "NOT_FOUND", "Уведомление не найдено");
      res.json({ ok: true });
    }),
  );
  app.post(
    "/api/notifications/test",
    route(async (req, res) => {
      const result = await transaction(pool, (c) =>
        notification(
          c,
          context(req),
          "test",
          "Cardo на связи",
          "Проверка уведомлений",
          "/notifications",
        ),
      );
      res.status(201).json({ ...result, ok: true });
    }),
  );
  return app;
}
