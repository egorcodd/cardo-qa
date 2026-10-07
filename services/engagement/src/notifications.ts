import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";

export async function notification(
  c: PoolClient,
  user: string,
  kind: string,
  title: string,
  body: string,
  url: string,
) {
  if (
    !/^\/(?:history|cards|rewards|notifications)(?:[/?][\w?=&-]*)?$/.test(url)
  )
    url = "/notifications";
  const id = randomUUID();
  await c.query(
    "INSERT INTO engagement.notifications(id,user_id,kind,title,body,url) VALUES($1,$2,$3,$4,$5,$6)",
    [id, user, kind, title, body, url],
  );
  const result = await c.query(
    "INSERT INTO engagement.deliveries(id,notification_id,subscription_id) SELECT gen_random_uuid(),$1,id FROM engagement.subscriptions WHERE user_id=$2 ON CONFLICT DO NOTHING",
    [id, user],
  );
  return { id, pushQueued: result.rowCount || 0 };
}
