import { randomUUID } from "node:crypto";
import { Router } from "express";
import type { Pool } from "pg";
import { route, context, fail } from "../../../../packages/shared/http.ts";
import { transaction } from "../../../../packages/shared/db.ts";
import { preferences } from "./preferences.ts";

export function reminderDto(row: Record<string, any>) {
  return {
    id: row.id,
    message: row.message,
    scheduledAt: row.scheduled_at.toISOString(),
    status: row.status,
    createdAt: row.created_at.toISOString(),
    deliveredAt: row.delivered_at?.toISOString() || null,
    cancelledAt: row.cancelled_at?.toISOString() || null,
  };
}
export function createRemindersRoutes(pool: Pool) {
  const app = Router();
  app.get("/api/reminders", route(async (req, res) => {
    const rows = (await pool.query(
      "SELECT * FROM engagement.reminders WHERE user_id=$1 ORDER BY scheduled_at DESC LIMIT 100",
      [context(req)],
    )).rows;
    res.json(rows.map(reminderDto));
  }));
  app.post("/api/reminders", route(async (req, res) => {
    const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
    const rawDate = req.body?.scheduledAt;
    const scheduledAt = typeof rawDate === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(rawDate) ? new Date(rawDate) : new Date(NaN);
    const key = req.body?.idempotencyKey ?? null;
    if (!message || [...message].length > 280 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(message) || !Number.isFinite(scheduledAt.getTime()) || (key !== null && (typeof key !== "string" || !/^[A-Za-z0-9_-]{1,80}$/.test(key))))
      fail(422, "INVALID_REMINDER", "Введи сообщение до 280 символов и время напоминания");
    const result = await transaction(pool, async (c) => {
      const user = context(req);
      await preferences(c, user);
      await c.query(
        "SELECT user_id FROM engagement.notification_preferences WHERE user_id=$1 FOR UPDATE",
        [user],
      );
      if (key !== null) {
        const saved = (await c.query(
          "SELECT * FROM engagement.reminders WHERE user_id=$1 AND idempotency_key=$2",
          [user, key],
        )).rows[0];
        if (saved) {
          if (saved.message !== message || saved.scheduled_at.getTime() !== scheduledAt.getTime())
            fail(409, "IDEMPOTENCY_CONFLICT", "Этот ключ уже использован для другого напоминания");
          return { replay: true, row: saved };
        }
      }
      const now = Date.now();
      if (scheduledAt.getTime() <= now || scheduledAt.getTime() > now + 365 * 24 * 60 * 60 * 1000)
        fail(422, "INVALID_REMINDER_TIME", "Выбери будущее время в пределах одного года");
      const pending = (await c.query(
        "SELECT count(*)::int count FROM engagement.reminders WHERE user_id=$1 AND status='scheduled'",
        [user],
      )).rows[0].count;
      if (pending >= 100)
        fail(409, "REMINDER_LIMIT", "Можно запланировать до 100 напоминаний");
      const row = (await c.query(
        "INSERT INTO engagement.reminders(id,user_id,message,scheduled_at,idempotency_key) VALUES($1,$2,$3,$4,$5) RETURNING *",
        [randomUUID(), user, message, scheduledAt, key],
      )).rows[0];
      return { replay: false, row };
    });
    res.status(result.replay ? 200 : 201).json(reminderDto(result.row));
  }));
  app.delete("/api/reminders/:id", route(async (req, res) => {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.params.id))
      fail(404, "NOT_FOUND", "Напоминание не найдено");
    await transaction(pool, async (c) => {
      const row = (await c.query(
        "SELECT status FROM engagement.reminders WHERE user_id=$1 AND id=$2 FOR UPDATE",
        [context(req), req.params.id],
      )).rows[0];
      if (!row) fail(404, "NOT_FOUND", "Напоминание не найдено");
      if (row.status === "delivered")
        fail(409, "REMINDER_DELIVERED", "Напоминание уже отправлено");
      await c.query(
        "UPDATE engagement.reminders SET status='cancelled',cancelled_at=coalesce(cancelled_at,now()) WHERE user_id=$1 AND id=$2",
        [context(req), req.params.id],
      );
    });
    res.json({ ok: true });
  }));
  return app;
}
