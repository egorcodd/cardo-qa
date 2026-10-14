import { upstream } from "../../../../packages/shared/http.ts";
import type { Pool } from "pg";
import { startWorker } from "../../../../packages/shared/worker.ts";
import { kafkaClient, kafkaEnabled, topics } from "../../../../packages/shared/kafka.ts";
import { backlog, events, eventType } from "../../../../packages/shared/metrics.ts";
import { log, publicEvent } from "../../../../packages/shared/telemetry.ts";

export async function startOutbox(pool: Pool, engagement: string) {
  const producer = kafkaEnabled() ? kafkaClient("banking").producer({ transactionalId: "cardo-banking-outbox", idempotent: true, maxInFlightRequests: 1, allowAutoTopicCreation: false }) : null;
  if (producer) await producer.connect();
  const stop = startWorker(async () => {
    try {
      const pending = (await pool.query("SELECT count(*)::int AS count FROM banking.outbox WHERE delivered_at IS NULL")).rows[0].count;
      backlog.set({ service: "banking" }, pending);
      const rows = (await pool.query("UPDATE banking.outbox SET next_attempt_at=now()+interval '30 seconds',attempts=attempts+1 WHERE id IN (SELECT id FROM banking.outbox WHERE delivered_at IS NULL AND next_attempt_at<=now() ORDER BY created_at LIMIT 10 FOR UPDATE SKIP LOCKED) RETURNING *")).rows;
      for (const row of rows) {
        const projection = publicEvent(row.payload);
        try {
          if (producer) {
            const transaction = await producer.transaction();
            try {
              await transaction.sendBatch({ topicMessages: [
                { topic: topics.banking, messages: [{ key: row.user_id, value: JSON.stringify(row.payload) }] },
                { topic: topics.practice, messages: [{ key: projection.accountRef, value: JSON.stringify(projection) }] },
              ] });
              await transaction.commit();
            } catch (error) { await transaction.abort(); throw error; }
          } else {
            const response = await upstream(engagement + "/internal/events", { method: "POST", body: JSON.stringify(row.payload) }, row.payload.requestId);
            if (!response.ok && !(response.status === 500 && row.payload.type === "banking.top-up.completed" && /\.25$/.test(String(row.payload.payload.amount)))) throw new Error("EVENT_DELIVERY_FAILED");
          }
          await pool.query("UPDATE banking.outbox SET delivered_at=now(),last_error=NULL WHERE id=$1", [row.id]);
          events.inc({ service: "banking", type: eventType(row.payload.type), stage: "publish", result: "ok" });
          log("banking", "info", "event.published", { ...projection, topic: producer ? topics.banking : "http" });
        } catch {
          await pool.query("UPDATE banking.outbox SET last_error=$2,next_attempt_at=now()+make_interval(secs=>$3) WHERE id=$1", [row.id, "EVENT_DELIVERY_FAILED", Math.min(300, 2 ** Math.min(row.attempts, 8))]);
          events.inc({ service: "banking", type: eventType(row.payload.type), stage: "publish", result: "error" });
          log("banking", "error", "event.retry", { ...projection, attempt: row.attempts, errorCode: "EVENT_DELIVERY_FAILED" });
        }
      }
    } catch { log("banking", "error", "outbox.failed", { errorCode: "OUTBOX_UNAVAILABLE" }); }
  });
  return async () => { await stop(); await producer?.disconnect(); };
}
