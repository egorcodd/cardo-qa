import type { Pool } from "pg";
import {
  service,
  route,
  internal,
  context,
  errors,
  fail,
} from "../../../packages/shared/http.ts";
import { name } from "../../../packages/shared/validation.ts";
import type { RatesClient } from "../../../packages/contracts/index.ts";
import { seed } from "./workspace.ts";
import { createCardsRoutes } from "./features/cards.ts";
import { createBanksRoutes } from "./features/banks.ts";
import { createContactsRoutes } from "./features/contacts.ts";
import { createHistoryRoutes } from "./features/history.ts";
import { createLimitsRoutes } from "./features/limits.ts";
import { createStatsRoutes } from "./features/stats.ts";
import { createTransfersRoutes } from "./features/transfers.ts";
import { createExchangeRoutes } from "./features/exchange.ts";
import { createTopUpsRoutes } from "./features/top-ups.ts";
import {
  createCustomerClient,
  type CustomerClient,
} from "./integrations/customer.ts";
import {
  createMembershipClient,
  type MembershipClient,
} from "./integrations/membership.ts";
export function createBankingApp(
  pool: Pool,
  rates: RatesClient,
  customer: CustomerClient = createCustomerClient(
    process.env.CUSTOMER_URL || "http://127.0.0.1:8081",
  ),
  membership: MembershipClient = createMembershipClient(
    process.env.ENGAGEMENT_URL || "http://127.0.0.1:8083",
  ),
) {
  const app = service("banking");
  app.get(
    "/health",
    route(async (_req, res) => {
      await pool.query("SELECT 1");
      res.json({ status: "ok", service: "banking" });
    }),
  );
  app.use(internal);
  app.post(
    "/internal/provision",
    route(async (req, res) => {
      const { userId } = req.body;
      if (typeof userId !== "string" || !/^[0-9a-f-]{36}$/.test(userId))
        fail(422, "INVALID_USER", "Укажи идентификатор клиента");
      if (req.body.demo !== undefined && typeof req.body.demo !== "boolean")
        fail(422, "INVALID_DEMO", "Некорректный тип аккаунта");
      const created = await seed(
        pool,
        userId,
        name(req.body.name),
        req.body.demo === true,
      );
      res.json({ ok: true, userId, created });
    }),
  );
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
  app.use(createBanksRoutes(pool));
  app.use(createContactsRoutes(pool, customer));
  app.use(createHistoryRoutes(pool));
  app.use(createLimitsRoutes(pool));
  app.use(createStatsRoutes(pool));
  app.use(createTransfersRoutes(pool, customer, membership));
  app.use(createTopUpsRoutes(pool));
  app.use(createExchangeRoutes(pool, rates));
  errors(app);
  return app;
}
