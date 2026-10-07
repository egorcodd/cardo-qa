import { upstream } from "../../../../packages/shared/http.ts";
import type { Pool } from "pg";
import { startWorker } from "../../../../packages/shared/worker.ts";
export function startOutbox(pool: Pool, engagement: string) {
  let delivering = false;
  async function dispatch() {
    if (delivering) return;
    delivering = true;
    try {
      const rows = (
        await pool.query(
          "UPDATE banking.outbox SET next_attempt_at=now()+interval '30 seconds',attempts=attempts+1 WHERE id IN (SELECT id FROM banking.outbox WHERE delivered_at IS NULL AND next_attempt_at<=now() ORDER BY created_at LIMIT 10 FOR UPDATE SKIP LOCKED) RETURNING *",
        )
      ).rows;
      for (const row of rows) {
        try {
          const response = await upstream(
            engagement + "/internal/events",
            { method: "POST", body: JSON.stringify(row.payload) },
            row.payload.requestId,
          );
          if (!response.ok) throw new Error("HTTP " + response.status);
          await pool.query(
            "UPDATE banking.outbox SET delivered_at=now(),last_error=NULL WHERE id=$1",
            [row.id],
          );
        } catch (e) {
          await pool.query(
            "UPDATE banking.outbox SET last_error=$2,next_attempt_at=now()+make_interval(secs=>$3) WHERE id=$1",
            [
              row.id,
              (e as Error).message,
              Math.min(300, 2 ** Math.min(row.attempts, 8)),
            ],
          );
        }
      }
    } catch (e) {
      console.error(
        JSON.stringify({
          level: "error",
          service: "banking",
          message: (e as Error).message,
        }),
      );
    } finally {
      delivering = false;
    }
  }
  return startWorker(dispatch);
}
