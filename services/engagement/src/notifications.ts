import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";

export type NotificationCategory = "transactions" | "service" | "offers";
export function notificationCategory(kind: string): NotificationCategory {
  if (["transfer", "transfer_incoming", "top_up"].includes(kind))
    return "transactions";
  if (["offer", "info"].includes(kind)) return "offers";
  return "service";
}
export async function notification(
  c: PoolClient,
  user: string,
  kind: string,
  title: string,
  body: string,
  url: string,
) {
  if (!/^\/(?:history(?:\/[\w-]+)?|cards(?:\/[\w-]+)?|rewards|notifications|exchange|send|settings|profile)?$/.test(url))
    url = "/notifications";
  const id = randomUUID(), category = notificationCategory(kind);
  await c.query(
    "INSERT INTO engagement.notifications(id,user_id,kind,title,body,url,category) VALUES($1,$2,$3,$4,$5,$6,$7)",
    [id, user, kind, title, body, url, category],
  );
  const result = await c.query(
    "INSERT INTO engagement.deliveries(id,notification_id,subscription_id) SELECT gen_random_uuid(),$1,s.id FROM engagement.subscriptions s LEFT JOIN engagement.notification_preferences p ON p.user_id=s.user_id WHERE s.user_id=$2 AND CASE $3 WHEN 'transactions' THEN coalesce(p.transactions,true) WHEN 'offers' THEN coalesce(p.offers,false) ELSE coalesce(p.service,true) END ON CONFLICT DO NOTHING",
    [id, user, category],
  );
  return { id, pushQueued: result.rowCount || 0 };
}
