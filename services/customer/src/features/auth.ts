import { randomUUID, randomBytes, timingSafeEqual } from "node:crypto";
import { route, fail } from "../../../../packages/shared/http.ts";
import * as validate from "../../../../packages/shared/validation.ts";
import { Router } from "express";
import type { Pool } from "pg";
import { publicUser, session, hashToken, scrypt } from "../identity.ts";
export function createAuthRoutes(pool: Pool) {
  const app = Router();
  app.post(
    "/api/auth/register",
    route(async (req, res) => {
      const p = validate.phone(req.body.phone),
        pw = validate.password(req.body.password),
        n = validate.name(req.body.name || "Клиент Cardo");
      if (
        req.body.confirmPassword !== undefined &&
        pw !== req.body.confirmPassword
      )
        fail(422, "PASSWORD_MISMATCH", "Пароли не совпадают");
      const salt = randomBytes(16).toString("hex");
      const key = (await scrypt(pw, salt, 64)) as Buffer;
      let user;
      try {
        user = (
          await pool.query(
            "INSERT INTO customer.users(id,phone,name,password_hash) VALUES($1,$2,$3,$4) RETURNING *",
            [randomUUID(), p, n, salt + ":" + key.toString("hex")],
          )
        ).rows[0];
      } catch (e) {
        if ((e as { code?: string }).code === "23505")
          fail(
            409,
            "PHONE_EXISTS",
            "Этот номер уже зарегистрирован. Войди в аккаунт",
          );
        throw e;
      }
      res
        .status(201)
        .json({ user: publicUser(user), token: await session(pool, user.id) });
    }),
  );
  app.post(
    "/api/auth/login",
    route(async (req, res) => {
      const p = validate.phone(req.body.phone),
        pw = validate.password(req.body.password);
      const user = (
        await pool.query("SELECT * FROM customer.users WHERE phone=$1", [p])
      ).rows[0];
      const [salt, expected] = (
        user?.password_hash || "0123456789abcdef:" + "00".repeat(64)
      ).split(":");
      const key = (await scrypt(pw, salt, 64)) as Buffer;
      if (!user || !timingSafeEqual(key, Buffer.from(expected, "hex")))
        fail(401, "BAD_CREDENTIALS", "Неверный номер или пароль");
      res.json({ user: publicUser(user), token: await session(pool, user.id) });
    }),
  );
  app.post(
    "/api/auth/logout",
    route(async (req, res) => {
      await pool.query("DELETE FROM customer.sessions WHERE token_hash=$1", [
        hashToken(String(req.body.token || "")),
      ]);
      res.json({ ok: true });
    }),
  );
  app.post(
    "/internal/session",
    route(async (req, res) => {
      const token = String(req.body.token || "");
      if (!/^[a-f0-9]{64}$/.test(token))
        fail(401, "UNAUTHORIZED", "Войди в аккаунт");
      const u = (
        await pool.query(
          "SELECT u.* FROM customer.users u JOIN customer.sessions s ON s.user_id=u.id WHERE s.token_hash=$1 AND s.expires_at>now()",
          [hashToken(token)],
        )
      ).rows[0];
      if (!u) fail(401, "UNAUTHORIZED", "Войди в аккаунт");
      res.json(publicUser(u));
    }),
  );
  return app;
}
