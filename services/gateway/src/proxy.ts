import type { Express } from "express";
import { route, fail } from "../../../packages/shared/http.ts";
import { call, type ServiceUrls } from "./dependencies.ts";
const owners: Record<string, keyof ServiceUrls> = {
  profile: "customer",
  settings: "customer",
  cards: "banking",
  contacts: "banking",
  transactions: "banking",
  limits: "banking",
  transfer: "banking",
  "profile-stats": "banking",
  exchange: "banking",
  rates: "rates",
  rewards: "engagement",
  notifications: "engagement",
  push: "engagement",
};
export function registerProxy(app: Express, urls: ServiceUrls) {
  app.use(
    "/api",
    route(async (req, res) => {
      res.set("Cache-Control", "no-store");
      const user = res.locals.user,
        group = req.path.split("/")[1],
        owner = owners[group];
      if (!owner) fail(404, "NOT_FOUND", "Не найдено");
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
        urls[owner] + req.originalUrl,
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
