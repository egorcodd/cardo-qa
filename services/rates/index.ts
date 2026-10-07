import { database, migrate } from "../../packages/shared/db.ts";
import { listen } from "../../packages/shared/http.ts";
import { createRatesApp } from "./src/app.ts";
const pool = database("rates");
await migrate(pool, new URL("./migrations/001-initial.sql", import.meta.url));
listen(createRatesApp(pool), Number(process.env.PORT || 8084), () =>
  pool.end(),
);
