import type { Pool } from "pg";
import { transaction } from "../../../../packages/shared/db.ts";
import { startWorker } from "../../../../packages/shared/worker.ts";
import { notification } from "../notifications.ts";

export async function deliverDueReminders(pool: Pool) {
  return transaction(pool, async (c) => {
    const rows = (await c.query(
      "SELECT id,user_id,message FROM engagement.reminders WHERE status='scheduled' AND scheduled_at<=now() ORDER BY scheduled_at,id LIMIT 20 FOR UPDATE SKIP LOCKED",
    )).rows;
    for (const row of rows) {
      const result = await notification(c, row.user_id, "reminder", "Напоминание", row.message, "/notifications");
      await c.query(
        "UPDATE engagement.reminders SET status='delivered',delivered_at=now(),notification_id=$2 WHERE id=$1",
        [row.id, result.id],
      );
    }
    return rows.length;
  });
}
export function startReminderDelivery(pool: Pool) {
  return startWorker(async () => { await deliverDueReminders(pool); });
}
