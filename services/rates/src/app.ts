import type { Pool } from "pg";
import {
  service,
  route,
  internal,
  errors,
  fail,
} from "../../../packages/shared/http.ts";
import { currencies } from "../../../packages/contracts/index.ts";
import { currentSnapshot } from "./snapshots.ts";
export function createRatesApp(pool: Pool) {
  const app = service("rates");
  app.get(
    "/health",
    route(async (_req, res) => {
      await pool.query("SELECT 1");
      res.json({ status: "ok", service: "rates" });
    }),
  );
  app.use(internal);
  app.get(
    "/api/rates",
    route(async (_req, res) => {
      const snapshot = await currentSnapshot(pool);
      res.json({
        base: snapshot.base,
        rates: Object.fromEntries(
          Object.entries(snapshot.units)
            .filter(([name]) => name !== "RUB")
            .map(([name, value]) => [name, Number(value) / 10000]),
        ),
        asOf: snapshot.source === "fixture" ? "fixture" : snapshot.publishedAt,
        version: snapshot.version,
      });
    }),
  );
  app.get(
    "/internal/quotes",
    route(async (req, res) => {
      const from = String(req.query.from || ""),
        to = String(req.query.to || "");
      if (
        !currencies.includes(from as (typeof currencies)[number]) ||
        !currencies.includes(to as (typeof currencies)[number]) ||
        from === to
      )
        fail(422, "INVALID_CURRENCY", "Выбери две разные валюты счёта");
      const snapshot = await currentSnapshot(pool);
      res.json({
        version: snapshot.version,
        from,
        to,
        numerator: snapshot.units[from],
        denominator: snapshot.units[to],
      });
    }),
  );
  errors(app);
  return app;
}
