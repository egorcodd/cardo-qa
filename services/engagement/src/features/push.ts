import { randomUUID } from "node:crypto";
import { route, context, fail } from "../../../../packages/shared/http.ts";
import { transaction } from "../../../../packages/shared/db.ts";
import { Router } from "express";
import type { Pool } from "pg";

export function createPushRoutes(pool: Pool, publicKey: string) {
  const app = Router();
  app.get("/api/push/config", (_req, res) => res.json({ publicKey }));
  app.post("/api/push/subscriptions", route(async (req, res) => {
    const sub = req.body?.subscription;
    let url: URL;
    try { url = new URL(sub?.endpoint); }
    catch { fail(422, "INVALID_SUBSCRIPTION", "Некорректная подписка"); }
    const hosts = ["fcm.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com"];
    if (
      url.protocol !== "https:" || url.port || url.username || url.password || url.hash ||
      (!hosts.includes(url.hostname) && !/^[a-z0-9.-]+\.notify\.windows\.com$/.test(url.hostname)) ||
      typeof sub.endpoint !== "string" || sub.endpoint.length > 2048 ||
      typeof sub.keys?.p256dh !== "string" || typeof sub.keys?.auth !== "string" ||
      !/^[A-Za-z0-9_-]+={0,2}$/.test(sub.keys.p256dh) ||
      !/^[A-Za-z0-9_-]+={0,2}$/.test(sub.keys.auth) ||
      Buffer.from(sub.keys.p256dh, "base64url").length !== 65 ||
      Buffer.from(sub.keys.p256dh, "base64url")[0] !== 4 ||
      Buffer.from(sub.keys.auth, "base64url").length !== 16
    ) fail(422, "INVALID_SUBSCRIPTION", "Некорректная подписка");
    const user = context(req);
    await transaction(pool, async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [sub.endpoint]);
      await c.query(
        "DELETE FROM engagement.subscriptions WHERE endpoint=$1 AND user_id<>$2",
        [sub.endpoint, user],
      );
      await c.query(
        "INSERT INTO engagement.subscriptions(id,user_id,endpoint,payload,language) VALUES($1,$2,$3,$4,$5) ON CONFLICT(endpoint) DO UPDATE SET payload=excluded.payload,language=excluded.language",
        [randomUUID(), user, sub.endpoint, { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } }, req.header("X-User-Language") === "en" ? "en" : "ru"],
      );
    });
    res.status(201).json({ ok: true });
  }));
  app.delete("/api/push/subscriptions", route(async (req, res) => {
    await pool.query(
      "DELETE FROM engagement.subscriptions WHERE user_id=$1 AND endpoint=$2",
      [context(req), String(req.body?.endpoint || "")],
    );
    res.json({ ok: true });
  }));
  return app;
}
