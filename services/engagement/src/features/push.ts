import { randomUUID } from "node:crypto";
import { route, context, fail } from "../../../../packages/shared/http.ts";
import { Router } from "express";
import type { Pool } from "pg";
export function createPushRoutes(pool: Pool, publicKey: string) {
  const app = Router();
  app.get("/api/push/config", (_req, res) =>
    res.json({ publicKey: publicKey }),
  );
  app.post(
    "/api/push/subscriptions",
    route(async (req, res) => {
      const sub = req.body.subscription;
      let url: URL;
      try {
        url = new URL(sub?.endpoint);
      } catch {
        fail(422, "INVALID_SUBSCRIPTION", "Некорректная подписка");
      }
      const hosts = [
        "fcm.googleapis.com",
        "updates.push.services.mozilla.com",
        "web.push.apple.com",
      ];
      if (
        url.protocol !== "https:" ||
        url.port ||
        (!hosts.includes(url.hostname) &&
          !/^[a-z0-9.-]+\.notify\.windows\.com$/.test(url.hostname)) ||
        String(sub.endpoint).length > 2048 ||
        Buffer.from(sub.keys?.p256dh || "", "base64url").length !== 65 ||
        Buffer.from(sub.keys?.auth || "", "base64url").length !== 16
      )
        fail(422, "INVALID_SUBSCRIPTION", "Некорректная подписка");
      await pool.query(
        "INSERT INTO engagement.subscriptions(id,user_id,endpoint,payload,language) VALUES($1,$2,$3,$4,$5) ON CONFLICT(user_id,endpoint) DO UPDATE SET payload=excluded.payload,language=excluded.language",
        [
          randomUUID(),
          context(req),
          sub.endpoint,
          sub,
          req.header("X-User-Language") === "en" ? "en" : "ru",
        ],
      );
      res.status(201).json({ ok: true });
    }),
  );
  app.delete(
    "/api/push/subscriptions",
    route(async (req, res) => {
      await pool.query(
        "DELETE FROM engagement.subscriptions WHERE user_id=$1 AND endpoint=$2",
        [context(req), String(req.body.endpoint || "")],
      );
      res.json({ ok: true });
    }),
  );
  return app;
}
