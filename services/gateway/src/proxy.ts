import type { Express } from "express";
import { route, fail } from "../../../packages/shared/http.ts";
import { call, type ServiceUrls } from "./dependencies.ts";
const owners: Record<string, keyof ServiceUrls> = {
  profile: "customer",
  settings: "customer",
  cards: "banking",
  contacts: "banking",
  banks: "banking",
  recipients: "banking",
  "top-ups": "banking",
  transactions: "banking",
  limits: "banking",
  transfer: "banking",
  "profile-stats": "banking",
  exchange: "banking",
  rates: "rates",
  rewards: "engagement",
  notifications: "engagement",
  membership: "engagement",
  reminders: "engagement",
  push: "engagement",
};
function publicTarget(base: string, originalUrl: string, group: string) {
  try {
    const pathname = originalUrl.split("?")[0];
    if (
      !pathname.startsWith("/api/") ||
      /[\\\u0000-\u0020\u007f]/.test(pathname)
    )
      fail(404, "NOT_FOUND", "Не найдено");
    for (const segment of pathname.split("/")) {
      const decoded = decodeURIComponent(segment);
      if (
        decoded === "." ||
        decoded === ".." ||
        /[\\/\u0000-\u0020\u007f]/.test(decoded) ||
        /%(?:2e|2f|5c)/i.test(decoded)
      )
        fail(404, "NOT_FOUND", "Не найдено");
    }
    const target = new URL(originalUrl, base);
    if (
      target.origin !== new URL(base).origin ||
      target.pathname !== pathname ||
      target.pathname.split("/")[2] !== group ||
      target.hash
    )
      fail(404, "NOT_FOUND", "Не найдено");
    return target.href;
  } catch {
    fail(404, "NOT_FOUND", "Не найдено");
  }
}
export function registerProxy(app: Express, urls: ServiceUrls) {
  app.use(
    "/api",
    route(async (req, res) => {
      res.set("Cache-Control", "no-store");
      const user = res.locals.user,
        group = req.path.split("/")[1],
        owner = Object.hasOwn(owners, group) ? owners[group] : undefined;
      if (!owner) fail(404, "NOT_FOUND", "Не найдено");
      const target = publicTarget(urls[owner], req.originalUrl, group);
      if (group === "banks") {
        const isCatalog =
          req.path === "/banks" && ["GET", "HEAD"].includes(req.method);
        const isFavorite =
          /^\/banks\/[a-z][a-z0-9-]{0,39}\/favorite$/.test(req.path) &&
          ["PUT", "DELETE"].includes(req.method);
        if (!isCatalog && !isFavorite) fail(404, "NOT_FOUND", "Не найдено");
      }
      const headers = {
        "X-User-Id": user.id,
        "X-User-Name": encodeURIComponent(user.name),
        "X-User-Language": user.language,
        ...(req.header("Idempotency-Key")
          ? { "Idempotency-Key": req.header("Idempotency-Key")! }
          : {}),
      };
      if (group === "settings" && req.method === "PUT" && req.body.mainCardId) {
        const response = await call(
          urls.banking + "/api/cards",
          { headers },
          res.locals.requestId,
        );
        if (!response.ok)
          fail(503, "DEPENDENCY_UNAVAILABLE", "Карты недоступны");
        if (
          !(await response.json()).some(
            (card: { id: string }) => card.id === req.body.mainCardId,
          )
        )
          fail(404, "CARD_NOT_FOUND", "Карта не найдена");
      }
      const response = await call(
        target,
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
        .status(response.status)
        .type(response.headers.get("Content-Type") || "application/json")
        .send(await response.text());
    }),
  );
}
