import type { Pool } from "pg";
import {
  service,
  route,
  internal,
  context,
  errors,
} from "../../../packages/shared/http.ts";
import type { RatesClient } from "../../../packages/contracts/index.ts";
import { seed } from "./workspace.ts";
import { createCardsRoutes } from "./features/cards.ts";
import { createContactsRoutes } from "./features/contacts.ts";
import { createHistoryRoutes } from "./features/history.ts";
import { createLimitsRoutes } from "./features/limits.ts";
import { createStatsRoutes } from "./features/stats.ts";
import { createTransfersRoutes } from "./features/transfers.ts";
import { createExchangeRoutes } from "./features/exchange.ts";
export function createBankingApp(pool: Pool, rates: RatesClient) {
  const app = service("banking");
  app.get(
    "/health",
    route(async (_req, res) => {
      await pool.query("SELECT 1");
      res.json({ status: "ok", service: "banking" });
    }),
  );
  app.use(internal);
  app.use("/api", (req, _res, next) => {
    seed(
      pool,
      context(req),
      decodeURIComponent(req.header("X-User-Name") || "Клиент Cardo"),
    )
      .then(() => next())
      .catch(next);
  });
  app.use(createCardsRoutes(pool));
  app.use(createContactsRoutes(pool));
  app.use(createHistoryRoutes(pool));
  app.use(createLimitsRoutes(pool));
  app.use(createStatsRoutes(pool));
  app.use(createTransfersRoutes(pool));
  app.use(createExchangeRoutes(pool, rates));
  errors(app);
  return app;
}
