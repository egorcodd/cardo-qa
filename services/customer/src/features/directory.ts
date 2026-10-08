import { randomUUID, randomBytes } from "node:crypto";
import { Router } from "express";
import type { Pool } from "pg";
import { route, fail } from "../../../../packages/shared/http.ts";
import { phone } from "../../../../packages/shared/validation.ts";
import { scrypt } from "../identity.ts";
const demos = {
  plus: { phone: "+79990001001", name: "Алексей Смирнов" },
  standard: { phone: "+79990001002", name: "Мария Волкова" },
};
export function createDirectoryRoutes(pool: Pool) {
  const app = Router();
  app.get(
    "/internal/users/resolve",
    route(async (req, res) => {
      let user;
      if (req.query.phone !== undefined)
        user = (
          await pool.query(
            "SELECT id,name,phone FROM customer.users WHERE phone=$1",
            [phone(req.query.phone)],
          )
        ).rows[0];
      else if (
        typeof req.query.id === "string" &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
          req.query.id,
        )
      )
        user = (
          await pool.query(
            "SELECT id,name,phone FROM customer.users WHERE id=$1",
            [req.query.id],
          )
        ).rows[0];
      else fail(422, "INVALID_RECIPIENT", "Введи телефон или номер карты");
      if (!user) fail(404, "RECIPIENT_NOT_FOUND", "Получатель не найден");
      res.json(user);
    }),
  );
  app.post(
    "/internal/demo-users",
    route(async (req, res) => {
      const key = req.body.key as keyof typeof demos;
      if (!Object.hasOwn(demos, key))
        fail(422, "INVALID_DEMO", "Неизвестный аккаунт");
      const demo = demos[key];
      const salt = randomBytes(16).toString("hex");
      const hash = (await scrypt("CardoDemo2026!", salt, 64)) as Buffer;
      try {
        await pool.query(
          "INSERT INTO customer.users(id,phone,name,password_hash,demo_key) VALUES($1,$2,$3,$4,$5) ON CONFLICT(demo_key) DO NOTHING",
          [
            randomUUID(),
            demo.phone,
            demo.name,
            salt + ":" + hash.toString("hex"),
            key,
          ],
        );
      } catch (error) {
        if ((error as { code?: string }).code === "23505")
          fail(
            409,
            "DEMO_PHONE_OCCUPIED",
            "Номер тестового аккаунта уже занят",
          );
        throw error;
      }
      const user = (
        await pool.query(
          "SELECT id,name,phone,demo_key FROM customer.users WHERE demo_key=$1",
          [key],
        )
      ).rows[0];
      res.json({ ...user, isDemo: true });
    }),
  );
  return app;
}
