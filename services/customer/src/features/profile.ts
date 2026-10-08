import { route, context, fail } from "../../../../packages/shared/http.ts";
import * as validate from "../../../../packages/shared/validation.ts";
import { Router } from "express";
import type { Pool } from "pg";
import { publicUser } from "../identity.ts";
export function createProfileRoutes(pool: Pool) {
  const app = Router();
  app.get(
    "/api/profile",
    route(async (req, res) => {
      const u = (
        await pool.query("SELECT * FROM customer.users WHERE id=$1", [
          context(req),
        ])
      ).rows[0];
      if (!u) fail(404, "NOT_FOUND", "Профиль не найден");
      res.json(publicUser(u));
    }),
  );
  app.patch(
    "/api/profile",
    route(async (req, res) => {
      const { name, email, birth, avatarTone } = req.body;
      const n = name === undefined ? null : validate.name(name);
      if (
        email !== undefined &&
        (typeof email !== "string" ||
          email.length > 254 ||
          (email && !/^[^\s@]+@?[^\s@]*\.[^\s@]{2,}$/.test(email)))
      )
        fail(422, "INVALID_EMAIL", "Проверь адрес электронной почты");
      let birthday = birth === undefined ? null : birth;
      if (birth !== undefined && birth !== "") {
        if (typeof birth !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(birth))
          fail(422, "INVALID_BIRTH", "Проверь дату рождения");
        const date = new Date(birth + "T00:00:00Z");
        const today = new Date();
        const age =
          today.getUTCFullYear() -
          date.getUTCFullYear() -
          Number(today.toISOString().slice(5, 10) < birth.slice(5, 10));
        if (
          !Number.isFinite(date.getTime()) ||
          date.toISOString().slice(0, 10) !== birth ||
          age < 14 ||
          age > 110
        )
          fail(422, "INVALID_BIRTH", "Возраст должен быть от 14 до 110 лет");
      }
      if (
        avatarTone !== undefined &&
        !["lime", "dark", "violet", "blue"].includes(avatarTone)
      )
        fail(422, "INVALID_AVATAR", "Выбери цвет аватара");
      if (
        Object.keys(req.body).every(
          (k) => !["name", "email", "birth", "avatarTone"].includes(k),
        )
      )
        fail(422, "EMPTY_PROFILE", "Укажи данные профиля");
      const u = (
        await pool.query(
          "UPDATE customer.users SET name=coalesce($2,name),email=coalesce($3,email),birth=CASE WHEN $4::boolean THEN $5::date ELSE birth END,avatar_tone=coalesce($6,avatar_tone) WHERE id=$1 RETURNING *",
          [
            context(req),
            n,
            email === undefined ? null : email.trim(),
            birth !== undefined && birthday !== "",
            birthday || null,
            avatarTone || null,
          ],
        )
      ).rows[0];
      res.json(publicUser(u));
    }),
  );
  return app;
}
