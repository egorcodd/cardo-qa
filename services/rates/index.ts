import { database, migrate } from "../../packages/shared/db.ts";
import { listen } from "../../packages/shared/http.ts";
import { createRatesApp } from "./src/app.ts";
import { createRateFeed } from "./src/feed.ts";
import { snapshotStore } from "./src/snapshots.ts";
const pool = database("rates");
await migrate(pool, new URL("./migrations/001-initial.sql", import.meta.url));
const feed = createRateFeed(snapshotStore(pool));
await feed.start();
listen(createRatesApp(pool, feed.current), Number(process.env.PORT || 8084), async () => {
  await feed.stop();
  await pool.end();
});
