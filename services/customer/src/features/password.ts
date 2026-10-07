import { randomBytes, timingSafeEqual } from "node:crypto";
import { route, context, fail } from "../../../../packages/shared/http.ts";
import { transaction } from "../../../../packages/shared/db.ts";
import * as validate from "../../../../packages/shared/validation.ts";
import { Router } from "express";
import type { Pool } from "pg";
import { scrypt } from "../identity.ts";
export function createPasswordRoutes(pool: Pool) {
  const app = Router();
  app.patch(
    "/api/profile/password",
    route(async (req, res) => {
      const pw = validate.password(req.body.password);
      const current = validate.password(req.body.currentPassword);
      if (pw !== req.body.confirmPassword)
        fail(422, "PASSWORD_MISMATCH", "Пароли не совпадают");
      if (pw === current) fail(422, "SAME_PASSWORD", "Придумай другой пароль");
      await transaction(pool, async (c) => {
        const u = (
          await c.query("SELECT * FROM customer.users WHERE id=$1 FOR UPDATE", [
            context(req),
          ])
        ).rows[0];
        const [salt, expected] = u.password_hash.split(":");
        const key = (await scrypt(current, salt, 64)) as Buffer;
        if (!timingSafeEqual(key, Buffer.from(expected, "hex")))
          fail(422, "BAD_PASSWORD", "Неверный текущий пароль");
        const newSalt = randomBytes(16).toString("hex");
        const newKey = (await scrypt(pw, newSalt, 64)) as Buffer;
        await c.query(
          "UPDATE customer.users SET password_hash=$2,password_changed_at=now() WHERE id=$1",
          [context(req), newSalt + ":" + newKey.toString("hex")],
        );
        await c.query("DELETE FROM customer.sessions WHERE user_id=$1", [
          context(req),
        ]);
      });
      res.json({ ok: true, reauthenticate: true });
    }),
  );
  return app;
}
