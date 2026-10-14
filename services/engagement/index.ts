import { database, migrate } from "../../packages/shared/db.ts";
import { listen } from "../../packages/shared/http.ts";
import { createEngagementApp } from "./src/app.ts";
import { configurePush, startPushDelivery } from "./src/workers/push.ts";
import { startReminderDelivery } from "./src/workers/reminders.ts";
import { startOfferDelivery } from "./src/workers/offers.ts";
import { kafkaEnabled } from "../../packages/shared/kafka.ts";
import { startEventConsumer } from "./src/workers/kafka.ts";
import { startNotificationOutbox } from "./src/workers/notification-outbox.ts";

const pool = database("engagement");
await migrate(pool, new URL("./migrations/001-initial.sql", import.meta.url));
const publicKey = await configurePush(pool);
const stopPush = startPushDelivery(pool);
const stopReminders = startReminderDelivery(pool);
const stopOffers = startOfferDelivery(pool);
const stopEvents = kafkaEnabled() ? await startEventConsumer(pool) : async () => {};
const stopNotificationEvents = kafkaEnabled() ? await startNotificationOutbox(pool) : async () => {};
listen(createEngagementApp(pool, publicKey), Number(process.env.PORT || 8083), async () => {
  await Promise.all([stopPush(), stopReminders(), stopOffers(), stopEvents(), stopNotificationEvents()]);
  await pool.end();
});
