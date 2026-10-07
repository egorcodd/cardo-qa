import { database, migrate } from "../../packages/shared/db.ts";
import { listen } from "../../packages/shared/http.ts";
import { createCustomerApp } from "./src/app.ts";
const pool = database("customer");
await migrate(pool, new URL("./migrations/001-initial.sql", import.meta.url));
listen(createCustomerApp(pool), Number(process.env.PORT || 8081), () =>
  pool.end(),
);
