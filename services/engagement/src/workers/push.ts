import webpush from "web-push";
import type { Pool } from "pg";
import { startWorker } from "../../../../packages/shared/worker.ts";
export async function configurePush(pool: Pool) {
  await pool.query(
    "INSERT INTO engagement.config(key,value) VALUES('vapid',$1) ON CONFLICT DO NOTHING",
    [webpush.generateVAPIDKeys()],
  );
  const keys = (
    await pool.query("SELECT value FROM engagement.config WHERE key='vapid'")
  ).rows[0].value;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:demo@cardo.local",
    keys.publicKey,
    keys.privateKey,
  );
  return keys.publicKey;
}
export function startPushDelivery(pool: Pool) {
  let sending = false;
  async function deliver() {
    if (sending) return;
    sending = true;
    try {
      const rows = (
        await pool.query(
          "UPDATE engagement.deliveries SET attempts=attempts+1,next_attempt_at=now()+interval '30 seconds' WHERE id IN (SELECT id FROM engagement.deliveries WHERE sent_at IS NULL AND next_attempt_at<=now() ORDER BY next_attempt_at LIMIT 10 FOR UPDATE SKIP LOCKED) RETURNING *",
        )
      ).rows;
      for (const d of rows) {
        const data = (
          await pool.query(
            "SELECT s.payload,s.language,n.kind,n.title,n.body,n.url FROM engagement.subscriptions s JOIN engagement.notifications n ON n.id=$2 WHERE s.id=$1",
            [d.subscription_id, d.notification_id],
          )
        ).rows[0];
        if (!data) continue;
        try {
          const title =
            data.language === "en"
              ? (
                  {
                    transfer: "Transfer complete",
                    reward: "Reward received",
                    test: "Cardo notification",
                  } as Record<string, string>
                )[data.kind] || data.title
              : data.title;
          await webpush.sendNotification(
            data.payload,
            JSON.stringify({
              title,
              body: data.body,
              url: data.url,
              tag: d.notification_id,
              icon: "/logo.png",
            }),
            { TTL: 300, timeout: 5000 },
          );
          await pool.query(
            "UPDATE engagement.deliveries SET sent_at=now(),last_error=NULL WHERE id=$1",
            [d.id],
          );
        } catch (e) {
          const code = (e as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410)
            await pool.query(
              "DELETE FROM engagement.subscriptions WHERE id=$1",
              [d.subscription_id],
            );
          else
            await pool.query(
              "UPDATE engagement.deliveries SET last_error=$2,next_attempt_at=now()+make_interval(secs=>$3) WHERE id=$1",
              [
                d.id,
                (e as Error).message.slice(0, 200),
                Math.min(300, 2 ** Math.min(d.attempts, 8)),
              ],
            );
        }
      }
    } catch (e) {
      console.error(
        JSON.stringify({
          level: "error",
          service: "engagement",
          message: (e as Error).message,
        }),
      );
    } finally {
      sending = false;
    }
  }
  return startWorker(deliver);
}
