import { route, context, fail } from "../../../../packages/shared/http.ts";
import { Router } from "express";
import type { Pool } from "pg";
import { publicUser } from "../identity.ts";
export function createSettingsRoutes(pool: Pool) {
  const app = Router();
  app.get(
    "/api/settings",
    route(async (req, res) => {
      const u = (
        await pool.query("SELECT * FROM customer.users WHERE id=$1", [
          context(req),
        ])
      ).rows[0];
      res.json(publicUser(u));
    }),
  );
  app.put(
    "/api/settings",
    route(async (req, res) => {
      const { language, theme, mainCardId, hideBalance } = req.body;
      if (hideBalance !== undefined && typeof hideBalance !== "boolean")
        fail(422, "INVALID_PREFERENCE", "Некорректная настройка баланса");
      if (language && !["ru", "en"].includes(language))
        fail(422, "INVALID_LANGUAGE", "Выбери язык");
      if (theme && !["light", "dark", "system"].includes(theme))
        fail(422, "INVALID_THEME", "Выбери тему");
      if (mainCardId && !/^[\w-]{1,60}$/.test(mainCardId))
        fail(422, "INVALID_CARD", "Некорректная карта");
      const u = (
        await pool.query(
          "UPDATE customer.users SET language=coalesce($2,language),theme=coalesce($3,theme),main_card_id=coalesce($4,main_card_id),hide_balance=coalesce($5,hide_balance) WHERE id=$1 RETURNING *",
          [
            context(req),
            language || null,
            theme || null,
            mainCardId || null,
            hideBalance || null,
          ],
        )
      ).rows[0];
      res.json(publicUser(u));
    }),
  );
  return app;
}
