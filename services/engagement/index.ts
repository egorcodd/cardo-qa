import { database, migrate } from "../../packages/shared/db.ts";
import { listen } from "../../packages/shared/http.ts";
import { createEngagementApp } from "./src/app.ts";
import { configurePush, startPushDelivery } from "./src/workers/push.ts";
const pool = database("engagement");
await migrate(pool, new URL("./migrations/001-initial.sql", import.meta.url));
const publicKey = await configurePush(pool);
const stop = startPushDelivery(pool);
listen(
  createEngagementApp(pool, publicKey),
  Number(process.env.PORT || 8083),
  async () => {
    await stop();
    await pool.end();
  },
);
