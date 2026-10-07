import {
  service,
  route,
  internal,
  errors,
} from "../../../packages/shared/http.ts";
import type { Pool } from "pg";
import { createAuthRoutes } from "./features/auth.ts";
import { createProfileRoutes } from "./features/profile.ts";
import { createPasswordRoutes } from "./features/password.ts";
import { createSettingsRoutes } from "./features/settings.ts";
export function createCustomerApp(pool: Pool) {
  const app = service("customer");
  app.get(
    "/health",
    route(async (_req, res) => {
      await pool.query("SELECT 1");
      res.json({ status: "ok", service: "customer" });
    }),
  );
  app.use(internal);
  app.use(createAuthRoutes(pool));
  app.use(createProfileRoutes(pool));
  app.use(createPasswordRoutes(pool));
  app.use(createSettingsRoutes(pool));
  errors(app);
  return app;
}
