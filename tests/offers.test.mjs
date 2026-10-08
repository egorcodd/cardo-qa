import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { migrate, transaction } from "../packages/shared/db.ts";
import { createEngagementApp } from "../services/engagement/src/app.ts";
import { deliverDueOffers } from "../services/engagement/src/workers/offers.ts";
import { deliverPendingPush } from "../services/engagement/src/workers/push.ts";
import { offerForSequence } from "../services/engagement/src/content/offers.ts";

const enabled = process.env.CARDO_ENGAGEMENT_INTEGRATION === "1";
const connectionString = process.env.TEST_ENGAGEMENT_DATABASE_URL ||
  "postgres://cardo_engagement:cardo_engagement_dev@127.0.0.1:5434/cardo";

function clockPool(pool, instant) {
  const replacement = "'" + new Date(instant).toISOString() + "'::timestamptz";
  const rewrite = (sql) => sql.replace(/\bnow\(\)/g, replacement);
  return {
    query: (sql, values) => pool.query(rewrite(sql), values),
    async connect() {
      const client = await pool.connect();
      return {
        query: (sql, values) => client.query(rewrite(sql), values),
        release: () => client.release(),
      };
    },
  };
}

test("offer cadence persists, respects opt-in and delivers once", {
  skip: !enabled,
  timeout: 30000,
}, async (t) => {
  const pool = new pg.Pool({ connectionString, connectionTimeoutMillis: 5000 });
  const freshPool = new pg.Pool({ connectionString, connectionTimeoutMillis: 5000 });
  const users = [randomUUID(), randomUUID(), randomUUID()];
  const [subscribed, inboxOnly, optedOut] = users;
  const future = Date.now() + 2 * 365 * 86400000;
  const clock = clockPool(pool, future);
  const freshClock = clockPool(freshPool, future);
  let server, guard;
  t.after(async () => {
    if (server) await new Promise((resolve) => {
      server.close(resolve);
      server.closeIdleConnections();
    });
    if (guard) {
      await guard.query("ROLLBACK");
      guard.release();
    }
    try {
      await transaction(pool, async (c) => {
        await c.query("DELETE FROM engagement.subscriptions WHERE user_id=ANY($1::uuid[])", [users]);
        await c.query("DELETE FROM engagement.notifications WHERE user_id=ANY($1::uuid[])", [users]);
        await c.query("DELETE FROM engagement.notification_preferences WHERE user_id=ANY($1::uuid[])", [users]);
      });
    } finally {
      await Promise.all([pool.end(), freshPool.end()]);
    }
  });
  await migrate(pool, new URL("../services/engagement/migrations/001-initial.sql", import.meta.url));
  for (const user of users)
    await pool.query("INSERT INTO engagement.notification_preferences(user_id) VALUES($1)", [user]);
  server = await new Promise((resolve) => {
    const running = createEngagementApp(pool, "test-public-key").listen(0, "127.0.0.1", () => resolve(running));
  });
  const url = "http://127.0.0.1:" + server.address().port;
  async function preferences(user, body) {
    const response = await fetch(url + "/api/notifications/preferences", {
      method: "PATCH",
      signal: AbortSignal.timeout(5000),
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Token": process.env.INTERNAL_TOKEN || "cardo-local-internal",
        "X-User-Id": user,
      },
      body: JSON.stringify(body),
    });
    assert.equal(response.status, 200);
    return response.json();
  }
  const schedule = async (user) => (await pool.query(
    "SELECT next_offer_at,last_sent_at,sequence FROM engagement.offer_schedules WHERE user_id=$1", [user],
  )).rows[0];
  const notices = async (user) => (await pool.query(
    "SELECT id,kind,category,title,body,url FROM engagement.notifications WHERE user_id=$1 ORDER BY created_at,id", [user],
  )).rows;
  const pending = async (user) => (await pool.query(
    "SELECT d.* FROM engagement.deliveries d JOIN engagement.notifications n ON n.id=d.notification_id WHERE n.user_id=$1 AND d.sent_at IS NULL", [user],
  )).rows;

  await t.test("first offer waits four hours and repeated opt-in keeps the date", async () => {
    const before = Date.now();
    for (const user of [subscribed, inboxOnly]) await preferences(user, { offers: true });
    const first = await schedule(subscribed);
    assert.ok(first.next_offer_at.getTime() >= before + 4 * 3600000);
    assert.ok(first.next_offer_at.getTime() <= Date.now() + 4 * 3600000);
    assert.equal(first.sequence, "0");
    assert.equal(first.last_sent_at, null);
    await preferences(subscribed, { offers: true });
    assert.deepEqual(await schedule(subscribed), first);
    assert.deepEqual(await notices(subscribed), []);
    assert.equal(await schedule(optedOut), undefined);
  });

  guard = await pool.connect();
  await guard.query("BEGIN");
  await guard.query("SELECT user_id FROM engagement.notification_preferences WHERE user_id<>ALL($1::uuid[]) FOR UPDATE", [users]);
  await guard.query("SELECT s.user_id FROM engagement.offer_schedules s WHERE s.user_id<>ALL($1::uuid[]) FOR UPDATE", [users]);
  await guard.query("SELECT d.id FROM engagement.deliveries d JOIN engagement.notifications n ON n.id=d.notification_id WHERE n.user_id<>ALL($1::uuid[]) FOR UPDATE OF d", [users]);
  const endpoint = "https://fcm.googleapis.com/fcm/send/offer-fixture-" + randomUUID();
  await pool.query(
    "INSERT INTO engagement.subscriptions(id,user_id,endpoint,payload) VALUES($1,$2,$3,$4)",
    [randomUUID(), subscribed, endpoint, { endpoint, keys: { p256dh: "fixture", auth: "fixture" } }],
  );

  await t.test("concurrent restarted workers create one offer per due account", async () => {
    await pool.query(
      "UPDATE engagement.offer_schedules SET next_offer_at=$2 WHERE user_id=ANY($1::uuid[])",
      [[subscribed, inboxOnly], new Date(future - 60000)],
    );
    const results = await Promise.all([deliverDueOffers(clock), deliverDueOffers(freshClock)]);
    assert.equal(results.reduce((sum, count) => sum + count, 0), 2);
    assert.equal(await deliverDueOffers(freshClock), 0);
    for (const user of [subscribed, inboxOnly]) {
      const saved = await notices(user);
      assert.equal(saved.length, 1);
      assert.equal(saved[0].kind, "offer");
      assert.equal(saved[0].category, "offers");
      const template = offerForSequence(user, "0");
      assert.equal(saved[0].title, template.title);
      assert.equal(saved[0].body, template.body);
      assert.equal(saved[0].url, template.url);
      assert.equal((await schedule(user)).sequence, "1");
      assert.equal((await schedule(user)).next_offer_at.getTime(), future + 4 * 3600000);
    }
    assert.equal((await pending(subscribed)).length, 1);
    assert.equal((await pending(inboxOnly)).length, 0);
    assert.deepEqual(await notices(optedOut), []);
  });

  await t.test("eligible WebPush uses the persisted offer and is not sent twice", async () => {
    const sent = [];
    const send = async (subscription, value) => {
      sent.push({ subscription, payload: JSON.parse(value) });
      return { statusCode: 201, headers: {}, body: "" };
    };
    assert.equal(await deliverPendingPush(clock, send), 1);
    assert.equal(await deliverPendingPush(freshClock, send), 0);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].subscription.endpoint, endpoint);
    assert.equal(sent[0].payload.userId, subscribed);
    assert.equal(sent[0].payload.title, (await notices(subscribed))[0].title);
    assert.equal(sent[0].payload.notificationId, (await notices(subscribed))[0].id);
    assert.equal(sent[0].payload.url, (await notices(subscribed))[0].url);
  });

  await t.test("late schedules send once, rotate text and wait another four hours", async () => {
    const previous = (await notices(subscribed))[0];
    await pool.query("UPDATE engagement.offer_schedules SET next_offer_at=$2 WHERE user_id=$1", [subscribed, new Date(future - 24 * 3600000)]);
    assert.equal(await deliverDueOffers(freshClock), 1);
    assert.equal(await deliverDueOffers(clock), 0);
    const saved = await notices(subscribed);
    assert.equal(saved.length, 2);
    assert.ok(saved.some((notice) => notice.title !== previous.title));
    assert.equal((await schedule(subscribed)).sequence, "2");
    assert.equal((await schedule(subscribed)).next_offer_at.getTime(), future + 4 * 3600000);
  });

  await t.test("opt-out pauses cadence and removes queued push while preserving inbox", async () => {
    const saved = await notices(subscribed);
    assert.equal((await pending(subscribed)).length, 1);
    await preferences(subscribed, { offers: false });
    assert.equal((await schedule(subscribed)).next_offer_at, null);
    assert.equal((await schedule(subscribed)).sequence, "2");
    assert.deepEqual(await notices(subscribed), saved);
    assert.deepEqual(await pending(subscribed), []);
    assert.equal(await deliverDueOffers(clock), 0);
    assert.equal(await deliverPendingPush(clock, async () => assert.fail("opted-out push was sent")), 0);
    const before = Date.now();
    await preferences(subscribed, { offers: true });
    const resumed = await schedule(subscribed);
    assert.ok(resumed.next_offer_at.getTime() >= before + 4 * 3600000);
    assert.equal(resumed.sequence, "2");
    await preferences(subscribed, { offers: false });
  });

  await t.test("a disabled preference prevents delivery even for a retained queued row", async () => {
    const notice = (await notices(subscribed))[0];
    const subscription = (await pool.query("SELECT id FROM engagement.subscriptions WHERE user_id=$1", [subscribed])).rows[0];
    const id = randomUUID();
    await pool.query(
      "INSERT INTO engagement.deliveries(id,notification_id,subscription_id,next_attempt_at) VALUES($1,$2,$3,$4) ON CONFLICT(notification_id,subscription_id) DO UPDATE SET sent_at=NULL,next_attempt_at=excluded.next_attempt_at,last_error=NULL",
      [id, notice.id, subscription.id, new Date(future)],
    );
    assert.equal(await deliverPendingPush(clock, async () => assert.fail("disabled offer was sent")), 1);
    assert.deepEqual(await pending(subscribed), []);
    assert.equal((await pool.query(
      "SELECT last_error FROM engagement.deliveries WHERE notification_id=$1", [notice.id],
    )).rows[0].last_error, "PREFERENCES_DISABLED");
  });

  await t.test("opting out and back in cannot revive an already claimed push", async () => {
    const notice = (await notices(subscribed))[0];
    await preferences(subscribed, { offers: true });
    await pool.query(
      "UPDATE engagement.deliveries SET sent_at=NULL,next_attempt_at=$2 WHERE notification_id=$1",
      [notice.id, new Date(future)],
    );
    const pausedClock = {
      ...clock,
      async query(sql, values) {
        const result = await clock.query(sql, values);
        if (sql.startsWith("UPDATE engagement.deliveries SET attempts=")) {
          await preferences(subscribed, { offers: false });
          await preferences(subscribed, { offers: true });
        }
        return result;
      },
    };
    assert.equal(await deliverPendingPush(pausedClock, async () => assert.fail("cancelled claimed offer was sent")), 1);
    assert.deepEqual(await pending(subscribed), []);
    await preferences(subscribed, { offers: false });
  });
});
