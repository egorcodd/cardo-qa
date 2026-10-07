import { database, migrate } from "../../packages/shared/db.ts";
import { listen } from "../../packages/shared/http.ts";
import { createBankingApp } from "./src/app.ts";
import { createRatesClient } from "./src/integrations/rates.ts";
import { startOutbox } from "./src/workers/outbox.ts";
const pool = database("banking");
await migrate(pool, new URL("./migrations/001-initial.sql", import.meta.url));
const rates = createRatesClient(
  process.env.RATES_URL || "http://127.0.0.1:8084",
);
const stop = startOutbox(
  pool,
  process.env.ENGAGEMENT_URL || "http://127.0.0.1:8083",
);
listen(
  createBankingApp(pool, rates),
  Number(process.env.PORT || 8082),
  async () => {
    await stop();
    await pool.end();
  },
);
