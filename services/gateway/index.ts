import express from "express";
import swaggerUi from "swagger-ui-express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  service,
  route,
  errors,
  fail,
  listen,
  upstream,
} from "../../packages/shared/http.ts";
import openapi from "./openapi.ts";
const app = service("gateway");
const urls = {
  customer: process.env.CUSTOMER_URL || "http://127.0.0.1:8081",
  banking: process.env.BANKING_URL || "http://127.0.0.1:8082",
  engagement: process.env.ENGAGEMENT_URL || "http://127.0.0.1:8083",
};
app.set("trust proxy", process.env.TRUST_PROXY === "1" ? 1 : false);
app.get(
  "/health",
  route(async (_req, res) => {
    const checks = await Promise.all(
      Object.entries(urls).map(async ([name, url]) => {
        try {
          const r = await fetch(url + "/health", {
            signal: AbortSignal.timeout(2000),
          });
          return { name, ok: r.ok };
        } catch {
          return { name, ok: false };
        }
      }),
    );
    const ok = checks.every((c) => c.ok);
    res
      .status(ok ? 200 : 503)
      .json({ status: ok ? "ok" : "degraded", services: checks });
  }),
);
app.get("/api/health", (_req, res) =>
  res.json({ status: "ok", version: "2.0.0" }),
);
app.get("/api/openapi.json", (_req, res) => res.json(openapi));
app.use(
  "/api/docs",
  swaggerUi.serve,
  swaggerUi.setup(openapi, { customSiteTitle: "Cardo API" }),
);
const attempts = new Map<string, { count: number; until: number }>();
app.use("/api/auth", (req, res, next) => {
  const key = req.ip || "local",
    now = Date.now(),
    old = attempts.get(key);
  const item = old && old.until > now ? old : { count: 0, until: now + 60000 };
  item.count++;
  attempts.set(key, item);
  if (item.count > 30)
    return res.status(429).json({
      error: {
        code: "TOO_MANY_ATTEMPTS",
        message: "Слишком много попыток. Подожди минуту",
      },
    });
  next();
});
setInterval(() => {
  for (const [k, v] of attempts) if (v.until < Date.now()) attempts.delete(k);
}, 60000).unref();
app.use("/api", (req, _res, next) => {
  const origin = req.header("Origin");
  try {
    if (origin && new URL(origin).host !== req.header("Host"))
      fail(403, "ORIGIN_REJECTED", "Запрос с другого сайта отклонён");
    next();
  } catch (e) {
    next(e);
  }
});
const cookie = (token: string, clear = false) =>
  "cardo_session=" +
  token +
  "; Path=/; HttpOnly; SameSite=Strict; Max-Age=" +
  (clear ? 0 : 2592000) +
  (process.env.COOKIE_SECURE === "true" ? "; Secure" : "");
const tokenOf = (req: express.Request) => {
  const bearer = req.header("Authorization");
  if (bearer?.startsWith("Bearer ")) return bearer.slice(7);
  const match = String(req.header("Cookie") || "").match(
    /(?:^|;\s*)cardo_session=([a-f0-9]{64})/,
  );
  return match?.[1] || "";
};
async function call(url: string, options: RequestInit, requestId: string) {
  try {
    return await upstream(url, options, requestId);
  } catch {
    fail(
      503,
      "DEPENDENCY_UNAVAILABLE",
      "Сервис временно недоступен. Попробуй ещё раз",
    );
  }
}
for (const action of ["register", "login", "logout"])
  app.post(
    "/api/auth/" + action,
    route(async (req, res) => {
      const body = action === "logout" ? { token: tokenOf(req) } : req.body;
      const r = await call(
        urls.customer + "/api/auth/" + action,
        { method: "POST", body: JSON.stringify(body) },
        res.locals.requestId,
      );
      const data = await r.json();
      if (r.ok)
        res.set("Set-Cookie", cookie(data.token || "", action === "logout"));
      res.status(r.status).json(data);
    }),
  );
app.use("/api", (req, res, next) => {
  Promise.resolve()
    .then(async () => {
      const token = tokenOf(req);
      if (!token) fail(401, "UNAUTHORIZED", "Войди в аккаунт");
      const r = await call(
        urls.customer + "/internal/session",
        { method: "POST", body: JSON.stringify({ token }) },
        res.locals.requestId,
      );
      if (!r.ok) fail(401, "UNAUTHORIZED", "Войди в аккаунт");
      res.locals.user = await r.json();
    })
    .then(() => next())
    .catch(next);
});
app.use(
  "/api",
  route(async (req, res) => {
    res.set("Cache-Control", "no-store");
    const u = res.locals.user;
    const publicPath = req.originalUrl;
    const routePath = req.path;
    const group = routePath.split("/")[1];
    const owner = ["profile", "settings"].includes(group)
      ? "customer"
      : ["rewards", "notifications", "push"].includes(group)
        ? "engagement"
        : "banking";
    const headers = {
      "X-User-Id": u.id,
      "X-User-Name": encodeURIComponent(u.name),
      "X-User-Language": u.language,
      ...(req.header("Idempotency-Key")
        ? { "Idempotency-Key": req.header("Idempotency-Key")! }
        : {}),
    };
    if (group === "settings" && req.method === "PUT" && req.body.mainCardId) {
      const cards = await call(
        urls.banking + "/api/cards",
        { headers },
        res.locals.requestId,
      );
      if (!cards.ok) fail(503, "DEPENDENCY_UNAVAILABLE", "Карты недоступны");
      if (
        !(await cards.json()).some(
          (c: { id: string }) => c.id === req.body.mainCardId,
        )
      )
        fail(404, "CARD_NOT_FOUND", "Карта не найдена");
    }
    const r = await call(
      urls[owner] + publicPath,
      {
        method: req.method,
        headers,
        ...(["GET", "HEAD"].includes(req.method)
          ? {}
          : { body: JSON.stringify(req.body) }),
      },
      res.locals.requestId,
    );
    res
      .status(r.status)
      .type(r.headers.get("Content-Type") || "application/json")
      .send(await r.text());
  }),
);
const dist = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../dist",
);
app.use(
  express.static(dist, {
    setHeaders(res, file) {
      if (
        file.endsWith("sw.js") ||
        file.endsWith("index.html") ||
        file.endsWith("manifest.webmanifest")
      )
        res.setHeader("Cache-Control", "no-cache");
    },
  }),
);
app.get("*", (_req, res) => res.sendFile(path.join(dist, "index.html")));
errors(app);
listen(app, Number(process.env.PORT || 8942));
