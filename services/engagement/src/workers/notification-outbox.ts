import type { Pool } from "pg";
import { kafkaClient, topics } from "../../../../packages/shared/kafka.ts";
import { startWorker } from "../../../../packages/shared/worker.ts";
import { backlog, events } from "../../../../packages/shared/metrics.ts";
import { log } from "../../../../packages/shared/telemetry.ts";

export async function startNotificationOutbox(pool: Pool) {
  const producer = kafkaClient("engagement").producer({ transactionalId: "cardo-engagement-notifications", idempotent: true, maxInFlightRequests: 1, allowAutoTopicCreation: false });
  await producer.connect();
  const stop = startWorker(async () => {
    try {
      const pending = (await pool.query("SELECT count(*)::int AS count FROM engagement.notification_outbox WHERE delivered_at IS NULL")).rows[0].count;
      backlog.set({ service: "engagement" }, pending);
      const rows = (await pool.query("UPDATE engagement.notification_outbox SET next_attempt_at=now()+interval '30 seconds',attempts=attempts+1 WHERE id IN (SELECT id FROM engagement.notification_outbox WHERE delivered_at IS NULL AND next_attempt_at<=now() ORDER BY created_at LIMIT 10 FOR UPDATE SKIP LOCKED) RETURNING *")).rows;
      for (const row of rows) {
        const context = { ...row.payload, topic: topics.notifications };
        try {
          const transaction = await producer.transaction();
          try {
            await transaction.send({ topic: topics.notifications, messages: [{ key: row.payload.accountRef, value: JSON.stringify(row.payload) }] });
            await transaction.commit();
          } catch (error) { await transaction.abort(); throw error; }
          await pool.query("UPDATE engagement.notification_outbox SET delivered_at=now(),last_error=NULL WHERE id=$1", [row.id]);
          events.inc({ service: "engagement", type: "engagement.notification.created", stage: "publish", result: "ok" });
          log("engagement", "info", "event.published", context);
        } catch {
          await pool.query("UPDATE engagement.notification_outbox SET last_error=$2,next_attempt_at=now()+make_interval(secs=>$3) WHERE id=$1", [row.id, "NOTIFICATION_EVENT_DELIVERY_FAILED", Math.min(300, 2 ** Math.min(row.attempts, 8))]);
          events.inc({ service: "engagement", type: "engagement.notification.created", stage: "publish", result: "error" });
          log("engagement", "error", "event.retry", { ...context, attempt: row.attempts, errorCode: "NOTIFICATION_EVENT_DELIVERY_FAILED" });
        }
      }
    } catch { log("engagement", "error", "outbox.failed", { errorCode: "NOTIFICATION_OUTBOX_UNAVAILABLE" }); }
  });
  return async () => { await stop(); await producer.disconnect(); };
}
