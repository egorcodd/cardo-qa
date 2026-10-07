import {
  service,
  route,
  internal,
  errors,
} from "../../../packages/shared/http.ts";
import type { Pool } from "pg";
import { createRewardsRoutes } from "./features/rewards.ts";
import { createEventsRoutes } from "./features/events.ts";
import { createNotificationsRoutes } from "./features/notifications.ts";
import { createPushRoutes } from "./features/push.ts";
export function createEngagementApp(pool: Pool, publicKey: string) {
  const app = service("engagement");
  app.get(
    "/health",
    route(async (_req, res) => {
      await pool.query("SELECT 1");
      res.json({ status: "ok", service: "engagement" });
    }),
  );
  app.use(internal);
  app.use(createEventsRoutes(pool));
  app.use(createRewardsRoutes(pool));
  app.use(createNotificationsRoutes(pool));
  app.use(createPushRoutes(pool, publicKey));
  errors(app);
  return app;
}
