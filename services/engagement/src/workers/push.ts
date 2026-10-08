import webpush from "web-push";
import type { Pool } from "pg";
import { transaction } from "../../../../packages/shared/db.ts";
import { startWorker } from "../../../../packages/shared/worker.ts";

export async function configurePush(pool: Pool) {
  await pool.query(
    "INSERT INTO engagement.config(key,value) VALUES('vapid',$1) ON CONFLICT DO NOTHING",
    [webpush.generateVAPIDKeys()],
  );
  const keys = (await pool.query("SELECT value FROM engagement.config WHERE key='vapid'")).rows[0].value;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:demo@cardo.local", keys.publicKey, keys.privateKey);
  return keys.publicKey;
}
export async function deliverPendingPush(
  pool: Pool,
  sendNotification: typeof webpush.sendNotification = webpush.sendNotification,
) {
  const rows = (await pool.query(
    "UPDATE engagement.deliveries SET attempts=attempts+1,next_attempt_at=now()+interval '2 minutes' WHERE id IN (SELECT id FROM engagement.deliveries WHERE sent_at IS NULL AND next_attempt_at<=now() ORDER BY next_attempt_at LIMIT 10 FOR UPDATE SKIP LOCKED) RETURNING *",
  )).rows;
  for (const d of rows) {
    await transaction(pool, async (c) => {
      await c.query(
        "SELECT p.user_id FROM engagement.notification_preferences p JOIN engagement.notifications n ON n.user_id=p.user_id WHERE n.id=$1 FOR SHARE OF p",
        [d.notification_id],
      );
      const data = (await c.query(
        "SELECT s.payload,s.language,n.user_id,n.kind,n.title,n.body,n.url,CASE n.category WHEN 'transactions' THEN coalesce(p.transactions,true) WHEN 'offers' THEN coalesce(p.offers,false) ELSE coalesce(p.service,true) END enabled FROM engagement.subscriptions s JOIN engagement.notifications n ON n.id=$2 AND n.user_id=s.user_id JOIN engagement.deliveries d ON d.id=$3 AND d.notification_id=n.id AND d.subscription_id=s.id AND d.sent_at IS NULL LEFT JOIN engagement.notification_preferences p ON p.user_id=s.user_id WHERE s.id=$1 FOR UPDATE OF d",
        [d.subscription_id, d.notification_id, d.id],
      )).rows[0];
      if (!data || !data.enabled) {
        await c.query("UPDATE engagement.deliveries SET sent_at=now(),last_error='PREFERENCES_DISABLED' WHERE id=$1", [d.id]);
        return;
      }
      try {
        const title = data.language === "en" ? ({
          transfer: "Transfer complete",
          transfer_incoming: "Money received",
          top_up: "Account topped up",
          reward: "Reward received",
          reminder: "Reminder",
          test: "Cardo notification",
        } as Record<string, string>)[data.kind] || data.title : data.title;
        await sendNotification(data.payload, JSON.stringify({
          title,
          body: data.body,
          url: data.url,
          tag: d.notification_id,
          notificationId: d.notification_id,
          userId: data.user_id,
          icon: "/icon-192.png",
        }), { TTL: 86400, timeout: 5000 });
        await c.query(
          "UPDATE engagement.deliveries SET sent_at=now(),last_error=NULL WHERE id=$1",
          [d.id],
        );
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410)
          await c.query("DELETE FROM engagement.subscriptions WHERE id=$1", [d.subscription_id]);
        else
          await c.query(
            "UPDATE engagement.deliveries SET last_error=$2,next_attempt_at=now()+make_interval(secs=>$3) WHERE id=$1",
            [d.id, (e as Error).message.slice(0, 200), Math.min(3600, 2 ** Math.min(d.attempts, 12))],
          );
      }
    });
  }
  return rows.length;
}
export function startPushDelivery(pool: Pool) {
  return startWorker(async () => { await deliverPendingPush(pool); });
}
