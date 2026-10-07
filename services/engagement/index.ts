import webpush from "web-push";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import {
  service,
  route,
  internal,
  context,
  errors,
  fail,
  listen,
} from "../../packages/shared/http.ts";
import { database, transaction, migrate } from "../../packages/shared/db.ts";
import type { DomainEvent } from "../../packages/contracts/index.ts";
const pool = database("engagement");
await migrate(pool, new URL("./migration.sql", import.meta.url));
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
const app = service("engagement");
app.get(
  "/health",
  route(async (_req, res) => {
    await pool.query("SELECT 1");
    res.json({ status: "ok", service: "engagement" });
  }),
);
app.use(internal);
const rewards = [
  {
    id: "plus",
    title: "Месяц Cardo Плюс",
    titleEn: "One month of Cardo Plus",
    cost: 100,
    description: "Дополнительные возможности аккаунта",
  },
  {
    id: "cashback",
    title: "Повышенный кешбэк",
    titleEn: "Extra cashback",
    cost: 150,
    description: "Бонус за активность в Cardo",
  },
  {
    id: "travel",
    title: "Бонус путешественника",
    titleEn: "Travel bonus",
    cost: 250,
    description: "Награда за регулярные переводы",
  },
];
async function ensure(user: string, c: PoolClient | typeof pool = pool) {
  await c.query(
    "INSERT INTO engagement.wallets(user_id) VALUES($1) ON CONFLICT DO NOTHING",
    [user],
  );
}
async function notification(
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
app.post(
  "/internal/events",
  route(async (req, res) => {
    const e = req.body as DomainEvent;
    if (
      !e ||
      e.type !== "banking.transfer.completed" ||
      e.version !== 1 ||
      !/^[0-9a-f-]{36}$/.test(e.id) ||
      !/^[0-9a-f-]{36}$/.test(e.userId) ||
      !e.payload?.transferId
    )
      fail(422, "INVALID_EVENT", "Некорректное событие");
    await transaction(pool, async (c) => {
      const inserted = await c.query(
        "INSERT INTO engagement.inbox(event_id) VALUES($1) ON CONFLICT DO NOTHING RETURNING event_id",
        [e.id],
      );
      if (!inserted.rowCount) return;
      await ensure(e.userId, c);
      await c.query(
        "UPDATE engagement.wallets SET points=points+5 WHERE user_id=$1",
        [e.userId],
      );
      await notification(
        c,
        e.userId,
        "transfer",
        "Перевод выполнен",
        e.payload.amount +
          " " +
          e.payload.currency +
          " · " +
          e.payload.recipient,
        "/history/" + e.payload.transferId,
      );
    });
    res.json({ ok: true });
  }),
);
app.get(
  "/api/rewards",
  route(async (req, res) => {
    const user = context(req);
    await ensure(user);
    const balance = (
      await pool.query(
        "SELECT points FROM engagement.wallets WHERE user_id=$1",
        [user],
      )
    ).rows[0].points;
    const claims = (
      await pool.query(
        "SELECT reward_id FROM engagement.redemptions WHERE user_id=$1",
        [user],
      )
    ).rows;
    res.json({
      balance,
      items: rewards.map((r) => ({
        ...r,
        claimed: claims.some((c) => c.reward_id === r.id),
      })),
    });
  }),
);
app.post(
  "/api/rewards/:id/claim",
  route(async (req, res) => {
    const user = context(req),
      reward = rewards.find((r) => r.id === req.params.id);
    if (!reward) fail(404, "REWARD_NOT_FOUND", "Награда не найдена");
    const result = await transaction(pool, async (c) => {
      await ensure(user, c);
      const wallet = (
        await c.query(
          "SELECT points FROM engagement.wallets WHERE user_id=$1 FOR UPDATE",
          [user],
        )
      ).rows[0];
      if (
        (
          await c.query(
            "SELECT 1 FROM engagement.redemptions WHERE user_id=$1 AND reward_id=$2",
            [user, reward.id],
          )
        ).rowCount
      )
        fail(409, "ALREADY_CLAIMED", "Награда уже получена");
      if (wallet.points < reward.cost)
        fail(409, "NOT_ENOUGH_POINTS", "Недостаточно баллов");
      await c.query(
        "UPDATE engagement.wallets SET points=points-$2 WHERE user_id=$1",
        [user, reward.cost],
      );
      await c.query(
        "INSERT INTO engagement.redemptions(user_id,reward_id) VALUES($1,$2)",
        [user, reward.id],
      );
      await notification(
        c,
        user,
        "reward",
        "Награда получена",
        reward.title,
        "/rewards",
      );
      return { ok: true, balance: wallet.points - reward.cost };
    });
    res.json(result);
  }),
);
app.get(
  "/api/notifications",
  route(async (req, res) => {
    const list = (
      await pool.query(
        "SELECT id,kind,title,body,url,read_at,created_at FROM engagement.notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100",
        [context(req)],
      )
    ).rows;
    res.json(list.map((n) => ({ ...n, read: !!n.read_at })));
  }),
);
app.patch(
  "/api/notifications/:id/read",
  route(async (req, res) => {
    const result = await pool.query(
      "UPDATE engagement.notifications SET read_at=coalesce(read_at,now()) WHERE user_id=$1 AND id=$2 RETURNING id",
      [context(req), req.params.id],
    );
    if (!result.rowCount) fail(404, "NOT_FOUND", "Уведомление не найдено");
    res.json({ ok: true });
  }),
);
app.get("/api/push/config", (_req, res) =>
  res.json({ publicKey: keys.publicKey }),
);
app.post(
  "/api/push/subscriptions",
  route(async (req, res) => {
    const sub = req.body.subscription;
    let url: URL;
    try {
      url = new URL(sub?.endpoint);
    } catch {
      fail(422, "INVALID_SUBSCRIPTION", "Некорректная подписка");
    }
    const hosts = [
      "fcm.googleapis.com",
      "updates.push.services.mozilla.com",
      "web.push.apple.com",
    ];
    if (
      url.protocol !== "https:" ||
      url.port ||
      (!hosts.includes(url.hostname) &&
        !/^[a-z0-9.-]+\.notify\.windows\.com$/.test(url.hostname)) ||
      String(sub.endpoint).length > 2048 ||
      Buffer.from(sub.keys?.p256dh || "", "base64url").length !== 65 ||
      Buffer.from(sub.keys?.auth || "", "base64url").length !== 16
    )
      fail(422, "INVALID_SUBSCRIPTION", "Некорректная подписка");
    await pool.query(
      "INSERT INTO engagement.subscriptions(id,user_id,endpoint,payload,language) VALUES($1,$2,$3,$4,$5) ON CONFLICT(user_id,endpoint) DO UPDATE SET payload=excluded.payload,language=excluded.language",
      [
        randomUUID(),
        context(req),
        sub.endpoint,
        sub,
        req.header("X-User-Language") === "en" ? "en" : "ru",
      ],
    );
    res.status(201).json({ ok: true });
  }),
);
app.delete(
  "/api/push/subscriptions",
  route(async (req, res) => {
    await pool.query(
      "DELETE FROM engagement.subscriptions WHERE user_id=$1 AND endpoint=$2",
      [context(req), String(req.body.endpoint || "")],
    );
    res.json({ ok: true });
  }),
);
app.post(
  "/api/notifications/test",
  route(async (req, res) => {
    const result = await transaction(pool, (c) =>
      notification(
        c,
        context(req),
        "test",
        "Cardo на связи",
        "Проверка уведомлений",
        "/notifications",
      ),
    );
    res.status(201).json({ ...result, ok: true });
  }),
);
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
          await pool.query("DELETE FROM engagement.subscriptions WHERE id=$1", [
            d.subscription_id,
          ]);
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
setInterval(deliver, 1000).unref();
errors(app);
listen(app, Number(process.env.PORT || 8083));
