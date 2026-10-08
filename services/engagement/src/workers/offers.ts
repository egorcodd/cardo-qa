import type { Pool, PoolClient } from "pg";
import { transaction } from "../../../../packages/shared/db.ts";
import { startWorker } from "../../../../packages/shared/worker.ts";
import { notification } from "../notifications.ts";
import { offerForSequence } from "../content/offers.ts";

export async function updateOfferSchedule(
  c: PoolClient,
  user: string,
  enabled: boolean,
) {
  await c.query(
    "INSERT INTO engagement.offer_schedules(user_id,next_offer_at) VALUES($1,CASE WHEN $2 THEN now()+interval '4 hours' END) ON CONFLICT(user_id) DO UPDATE SET next_offer_at=CASE WHEN $2 THEN coalesce(engagement.offer_schedules.next_offer_at,excluded.next_offer_at) END",
    [user, enabled],
  );
}

export async function deliverDueOffers(pool: Pool) {
  return transaction(pool, async (c) => {
    const rows = (await c.query(
      "SELECT s.user_id,s.sequence FROM engagement.offer_schedules s JOIN engagement.notification_preferences p ON p.user_id=s.user_id WHERE p.offers AND s.next_offer_at<=now() ORDER BY s.next_offer_at,s.user_id LIMIT 20 FOR UPDATE OF s,p SKIP LOCKED",
    )).rows;
    for (const row of rows) {
      const offer = offerForSequence(row.user_id, row.sequence);
      await notification(c, row.user_id, "offer", offer.title, offer.body, offer.url);
      await c.query(
        "UPDATE engagement.offer_schedules SET next_offer_at=now()+interval '4 hours',last_sent_at=now(),sequence=sequence+1 WHERE user_id=$1",
        [row.user_id],
      );
    }
    return rows.length;
  });
}

export function startOfferDelivery(pool: Pool) {
  return startWorker(async () => { await deliverDueOffers(pool); }, 60000);
}
