import { Router } from "express";
import type { Pool, PoolClient } from "pg";
import { route, context, fail } from "../../../../packages/shared/http.ts";
import { transaction } from "../../../../packages/shared/db.ts";
import { ensure } from "../wallet.ts";
import { notification } from "../notifications.ts";

export async function ensureMembership(c: Pool | PoolClient, user: string) {
  await c.query(
    "INSERT INTO engagement.memberships(user_id) VALUES($1) ON CONFLICT DO NOTHING",
    [user],
  );
}
export async function membership(c: Pool | PoolClient, user: string) {
  await ensureMembership(c, user);
  const row = (await c.query(
    "SELECT expires_at,coalesce(expires_at>now(),false) premium FROM engagement.memberships WHERE user_id=$1",
    [user],
  )).rows[0];
  return {
    premium: row.premium,
    plan: row.premium ? "plus" : "standard",
    expiresAt: row.premium ? row.expires_at.toISOString() : null,
  };
}
export function createMembershipRoutes(pool: Pool) {
  const app = Router();
  app.get("/api/membership", route(async (req, res) => {
    res.json(await membership(pool, context(req)));
  }));
  app.post("/internal/provision", route(async (req, res) => {
    const { userId, premium, demo } = req.body || {};
    if (typeof userId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId) || typeof premium !== "boolean" || typeof demo !== "boolean" || (premium && !demo))
      fail(422, "INVALID_PROVISION", "Некорректная инициализация аккаунта");
    const result = await transaction(pool, async (c) => {
      const inserted = await c.query(
        "INSERT INTO engagement.provisions(user_id,demo) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING user_id",
        [userId, demo],
      );
      await ensure(pool, userId, c);
      await c.query(
        "INSERT INTO engagement.notification_preferences(user_id) VALUES($1) ON CONFLICT DO NOTHING",
        [userId],
      );
      if (inserted.rowCount) {
        await c.query(
          "INSERT INTO engagement.memberships(user_id,expires_at) VALUES($1,CASE WHEN $2 THEN now()+interval '30 days' ELSE NULL END) ON CONFLICT(user_id) DO UPDATE SET expires_at=CASE WHEN $2 THEN greatest(engagement.memberships.expires_at,excluded.expires_at) ELSE engagement.memberships.expires_at END",
          [userId, premium],
        );
        await notification(c, userId, "service", "Добро пожаловать в Cardo", "Ваши карты уже в приложении. Пополняйте счёт, переводите деньги и следите за операциями в истории.", "/cards");
        if (demo)
          await notification(c, userId, "info", premium ? "Cardo Плюс подключён" : "Переводы с меньшей комиссией", premium ? "С Cardo Плюс комиссия за перевод составляет 100 ₽. Срок действия подписки указан в профиле." : "Оформите Cardo Плюс за 100 баллов: комиссия за перевод составит 100 ₽ вместо 500 ₽.", premium ? "/profile" : "/rewards");
      }
      return { ok: true, ...(await membership(c, userId)) };
    });
    res.json(result);
  }));
  return app;
}
