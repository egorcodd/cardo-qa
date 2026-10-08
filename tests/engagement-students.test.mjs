import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { migrate, transaction } from "../packages/shared/db.ts";
import { createEngagementApp } from "../services/engagement/src/app.ts";
import { deliverDueReminders } from "../services/engagement/src/workers/reminders.ts";

const enabled = process.env.CARDO_ENGAGEMENT_INTEGRATION === "1";
const connectionString =
  process.env.TEST_ENGAGEMENT_DATABASE_URL ||
  "postgres://cardo_engagement:cardo_engagement_dev@127.0.0.1:5434/cardo";
const internal = process.env.INTERNAL_TOKEN || "cardo-local-internal";
const close = (server) =>
  new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
    server.closeIdleConnections();
  });
async function listen(pool) {
  const server = await new Promise((resolve) => {
    const server = createEngagementApp(
      pool,
      "integration-test-public-key",
    ).listen(0, "127.0.0.1", () => resolve(server));
  });
  return { server, url: "http://127.0.0.1:" + server.address().port };
}

test(
  "Engagement student workflows persist in PostgreSQL",
  { skip: !enabled, timeout: 60000 },
  async (t) => {
    const pool = new pg.Pool({
      connectionString,
      connectionTimeoutMillis: 5000,
    });
    const users = [randomUUID(), randomUUID(), randomUUID()];
    const [sender, receiver, demo] = users;
    const eventIds = [];
    let running;
    t.after(async () => {
      try {
        if (running) await close(running.server);
      } finally {
        try {
          await transaction(pool, async (c) => {
            await c.query(
              "DELETE FROM engagement.subscriptions WHERE user_id=ANY($1::uuid[])",
              [users],
            );
            await c.query(
              "DELETE FROM engagement.reminders WHERE user_id=ANY($1::uuid[])",
              [users],
            );
            await c.query(
              "DELETE FROM engagement.notifications WHERE user_id=ANY($1::uuid[])",
              [users],
            );
            await c.query(
              "DELETE FROM engagement.redemptions WHERE user_id=ANY($1::uuid[])",
              [users],
            );
            for (const table of [
              "wallets",
              "memberships",
              "provisions",
              "notification_preferences",
            ])
              await c.query(
                "DELETE FROM engagement." +
                  table +
                  " WHERE user_id=ANY($1::uuid[])",
                [users],
              );
            await c.query(
              "DELETE FROM engagement.inbox WHERE event_id=ANY($1::uuid[])",
              [eventIds],
            );
          });
        } finally {
          await pool.end();
        }
      }
    });
    await migrate(
      pool,
      new URL(
        "../services/engagement/migrations/001-initial.sql",
        import.meta.url,
      ),
    );
    running = await listen(pool);
    async function call(path, user, method = "GET", body) {
      const response = await fetch(running.url + path, {
        method,
        signal: AbortSignal.timeout(5000),
        headers: {
          "Content-Type": "application/json",
          "X-Internal-Token": internal,
          ...(user ? { "X-User-Id": user } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return { status: response.status, body: await response.json() };
    }
    function event(value) {
      const id = randomUUID();
      eventIds.push(id);
      return {
        id,
        userId: sender,
        requestId: "engagement-test-" + id,
        occurredAt: new Date().toISOString(),
        ...value,
      };
    }

    await t.test(
      "provision keeps normal membership and seeds a demo once",
      async () => {
        for (const userId of [sender, receiver]) {
          const provision = await call("/internal/provision", null, "POST", {
            userId,
            premium: false,
            demo: false,
          });
          assert.equal(provision.status, 200);
          assert.deepEqual((await call("/api/membership", userId)).body, {
            premium: false,
            plan: "standard",
            expiresAt: null,
          });
          assert.equal((await call("/api/rewards", userId)).body.balance, 100);
        }
        const values = { userId: demo, premium: true, demo: true };
        const first = await call("/internal/provision", null, "POST", values);
        const second = await call("/internal/provision", null, "POST", values);
        assert.equal(first.status, 200);
        assert.deepEqual(second.body, first.body);
        assert.equal(first.body.premium, true);
        assert.equal(first.body.plan, "plus");
        assert.ok(
          Date.parse(first.body.expiresAt) > Date.now() + 29 * 86400000,
        );
        assert.equal((await call("/api/notifications", demo)).body.length, 2);
        assert.equal(
          (
            await call("/internal/provision", null, "POST", {
              userId: randomUUID(),
              premium: true,
              demo: false,
            })
          ).status,
          422,
        );
      },
    );

    await t.test(
      "concurrent v2 replay notifies both own operations and rewards only the sender",
      async () => {
        const senderOperationId = "n" + randomUUID(),
          receiverOperationId = "n" + randomUUID();
        const transfer = event({
          type: "banking.transfer.completed",
          version: 2,
          payload: {
            transferId: senderOperationId,
            senderUserId: sender,
            receiverUserId: receiver,
            senderOperationId,
            receiverOperationId,
            amount: "10.50",
            currency: "RUB",
            senderName: "Отправитель",
            receiverName: "Получатель",
          },
        });
        const replies = await Promise.all(
          Array.from({ length: 5 }, () =>
            call("/internal/events", null, "POST", transfer),
          ),
        );
        assert.ok(replies.every((reply) => reply.status === 200));
        for (const [user, kind, operationId] of [
          [sender, "transfer", senderOperationId],
          [receiver, "transfer_incoming", receiverOperationId],
        ]) {
          const notices = (await call("/api/notifications", user)).body.filter(
            (notice) => notice.kind === kind,
          );
          assert.equal(notices.length, 1);
          assert.equal(notices[0].url, "/history/" + operationId);
          assert.equal(notices[0].title, user === sender ? "Перевод выполнен" : "Деньги поступили");
          assert.equal(
            notices[0].body,
            user === sender
              ? "Отправлено 10,5\u00a0₽. Получатель: Получатель."
              : "Зачислено 10,5\u00a0₽. Отправитель: Отправитель.",
          );
        }
        assert.equal((await call("/api/rewards", sender)).body.balance, 105);
        assert.equal((await call("/api/rewards", receiver)).body.balance, 100);
        assert.equal(
          (
            await pool.query(
              "SELECT count(*)::int count FROM engagement.inbox WHERE event_id=$1",
              [transfer.id],
            )
          ).rows[0].count,
          1,
        );
        const topUp = event({
          type: "banking.top-up.completed",
          version: 1,
          payload: {
            operationId: "n" + randomUUID(),
            amount: "20.00",
            currency: "RUB",
            balance: "20.00",
          },
        });
        for (let i = 0; i < 2; i++)
          assert.equal(
            (await call("/internal/events", null, "POST", topUp)).status,
            200,
          );
        assert.equal((await call("/api/rewards", sender)).body.balance, 105);
        const topUpNotices = (
          await call("/api/notifications", sender)
        ).body.filter((notice) => notice.kind === "top_up");
        assert.equal(topUpNotices.length, 1);
        assert.equal(topUpNotices[0].title, "Счёт пополнен");
        assert.equal(topUpNotices[0].body, "На счёт зачислено 20\u00a0₽.");
        assert.equal(
          topUpNotices[0].url,
          "/history/" + topUp.payload.operationId,
        );
        const legacy = event({
          type: "banking.transfer.completed",
          version: 1,
          payload: {
            transferId: "n" + randomUUID(),
            amount: "1.00",
            currency: "RUB",
            recipient: "Прежний получатель",
          },
        });
        for (let i = 0; i < 2; i++)
          assert.equal(
            (await call("/internal/events", null, "POST", legacy)).status,
            200,
          );
        assert.equal((await call("/api/rewards", sender)).body.balance, 110);
        assert.equal((await call("/api/rewards", receiver)).body.balance, 100);
      },
    );

    await t.test(
      "external transfer replay creates one sender notice and one points reward",
      async () => {
        const operationId = "n" + randomUUID();
        const external = event({
          userId: receiver,
          type: "banking.external-transfer.completed",
          version: 1,
          payload: {
            operationId,
            amount: "0.01",
            currency: "RUB",
            bankId: "vtb",
            bankName: "ВТБ",
            recipientReference: "•••• 1234",
          },
        });
        const repeats = [
          external,
          external,
          external,
          event({ ...external, id: randomUUID() }),
          event({ ...external, id: randomUUID() }),
        ];
        for (const repeat of repeats)
          if (!eventIds.includes(repeat.id)) eventIds.push(repeat.id);
        const replies = await Promise.all(
          repeats.map((repeat) =>
            call("/internal/events", null, "POST", repeat),
          ),
        );
        assert.ok(replies.every((reply) => reply.status === 200));
        const notices = (
          await call("/api/notifications", receiver)
        ).body.filter((notice) => notice.url === "/history/" + operationId);
        assert.equal(notices.length, 1);
        assert.equal(notices[0].kind, "transfer");
        assert.equal(notices[0].body, "Отправлено 0,01\u00a0₽. Банк: ВТБ. •••• 1234.");
        assert.equal((await call("/api/rewards", receiver)).body.balance, 105);
        assert.equal((await call("/api/rewards", sender)).body.balance, 110);
        for (const other of [sender, demo])
          assert.equal(
            (await call("/api/notifications", other)).body.filter(
              (notice) => notice.url === "/history/" + operationId,
            ).length,
            0,
          );
        assert.deepEqual(
          (
            await pool.query(
              "SELECT user_id,category FROM engagement.notifications WHERE url=$1",
              ["/history/" + operationId],
            )
          ).rows,
          [{ user_id: receiver, category: "transactions" }],
        );
        const malformed = [
          { version: 2 },
          { userId: "not-a-user" },
          { payload: { ...external.payload, bankId: "unknown" } },
          { payload: { ...external.payload, bankName: "Другой банк" } },
          { payload: { ...external.payload, operationId: "" } },
          { payload: { ...external.payload, operationId: "../private" } },
          {
            payload: {
              ...external.payload,
              recipientReference: "<script>1234</script>",
            },
          },
          { payload: { ...external.payload, recipientReference: "•••• 12" } },
          { payload: { ...external.payload, amount: "0.00" } },
          { payload: { ...external.payload, currency: "XYZ" } },
        ];
        for (const patch of malformed) {
          const invalid = event({ ...external, ...patch, id: randomUUID() });
          eventIds.push(invalid.id);
          assert.equal(
            (await call("/internal/events", null, "POST", invalid)).status,
            422,
          );
          assert.equal(
            (
              await pool.query(
                "SELECT event_id FROM engagement.inbox WHERE event_id=$1",
                [invalid.id],
              )
            ).rowCount,
            0,
          );
        }
        assert.equal((await call("/api/rewards", receiver)).body.balance, 105);
        const phone = event({
          ...external,
          id: randomUUID(),
          payload: {
            ...external.payload,
            operationId: "n" + randomUUID(),
            bankId: "tbank",
            bankName: "Т-Банк",
            recipientReference: "+79991234567",
            amount: "10.50",
          },
        });
        eventIds.push(phone.id);
        assert.equal(
          (await call("/internal/events", null, "POST", phone)).status,
          200,
        );
        const phoneNotice = (
          await call("/api/notifications", receiver)
        ).body.find(
          (notice) => notice.url === "/history/" + phone.payload.operationId,
        );
        assert.equal(phoneNotice.body, "Отправлено 10,5\u00a0₽. Банк: Т-Банк. +7 ••• •••-4567.");
        assert.ok(!phoneNotice.body.includes("79991234567"));
        assert.equal((await call("/api/rewards", receiver)).body.balance, 110);
        assert.equal((await call("/api/rewards", sender)).body.balance, 110);
      },
    );

    await t.test(
      "Plus redemption activates once and provision preserves balances and expiry",
      async () => {
        const claims = await Promise.all(
          [1, 2].map(() => call("/api/rewards/plus/claim", sender, "POST", {})),
        );
        assert.deepEqual(
          claims.map((claim) => claim.status).sort(),
          [200, 409],
        );
        const membership = (await call("/api/membership", sender)).body;
        assert.equal(membership.premium, true);
        assert.equal(membership.plan, "plus");
        assert.ok(
          Date.parse(membership.expiresAt) > Date.now() + 29 * 86400000,
        );
        await call("/internal/provision", null, "POST", {
          userId: sender,
          premium: false,
          demo: false,
        });
        assert.deepEqual(
          (await call("/api/membership", sender)).body,
          membership,
        );
        assert.equal((await call("/api/rewards", sender)).body.balance, 10);
        assert.equal(
          (await call("/api/notifications", sender)).body.filter(
            (notice) => notice.title === "Добро пожаловать в Cardo",
          ).length,
          1,
        );
        await pool.query(
          "UPDATE engagement.memberships SET expires_at=now()-interval '1 second' WHERE user_id=$1",
          [demo],
        );
        assert.deepEqual((await call("/api/membership", demo)).body, {
          premium: false,
          plan: "standard",
          expiresAt: null,
        });
      },
    );

    await t.test(
      "preferences validate opt-in categories without deleting inbox history",
      async () => {
        assert.deepEqual(
          (await call("/api/notifications/preferences", sender)).body,
          { transactions: true, service: true, offers: false },
        );
        assert.equal(
          (
            await call("/api/notifications/preferences", sender, "PATCH", {
              offers: "true",
            })
          ).status,
          422,
        );
        for (const user of users)
          assert.deepEqual(
            (
              await call("/api/notifications/preferences", user, "PATCH", {
                transactions: false,
                service: false,
                offers: false,
              })
            ).body,
            { transactions: false, service: false, offers: false },
          );
        assert.equal(
          (await call("/api/notifications", sender)).body.filter(
            (notice) => notice.kind === "transfer",
          ).length,
          2,
        );
      },
    );

    await t.test(
      "persistent reminders replay, cancel, and deliver once through fresh workers",
      async () => {
        const scheduledAt = new Date(Date.now() + 3600000).toISOString();
        const values = {
          message: "Проверить квитанцию перевода",
          scheduledAt,
          idempotencyKey: randomUUID(),
        };
        const results = await Promise.all(
          [1, 2].map(() => call("/api/reminders", sender, "POST", values)),
        );
        assert.deepEqual(
          results.map((result) => result.status).sort(),
          [200, 201],
        );
        assert.equal(new Set(results.map((result) => result.body.id)).size, 1);
        const reminder = results[0].body;
        assert.equal(
          (
            await call("/api/reminders", sender, "POST", {
              ...values,
              message: "Другое сообщение",
            })
          ).status,
          409,
        );
        assert.equal(
          (await call("/api/reminders/" + reminder.id, receiver, "DELETE"))
            .status,
          404,
        );
        assert.equal(
          (
            await call("/api/reminders", sender, "POST", {
              message: "Прошедшее время",
              scheduledAt: new Date(Date.now() - 1000).toISOString(),
            })
          ).status,
          422,
        );
        assert.equal(
          (
            await call("/api/reminders", sender, "POST", {
              message: "Слишком поздно",
              scheduledAt: new Date(Date.now() + 366 * 86400000).toISOString(),
            })
          ).status,
          422,
        );
        assert.equal(
          (
            await call("/api/reminders", sender, "POST", {
              message: "x".repeat(281),
              scheduledAt,
            })
          ).status,
          422,
        );
        const cancelled = await call("/api/reminders", sender, "POST", {
          message: "Отменённая проверка",
          scheduledAt,
        });
        assert.equal(cancelled.status, 201);
        for (let i = 0; i < 2; i++)
          assert.equal(
            (
              await call(
                "/api/reminders/" + cancelled.body.id,
                sender,
                "DELETE",
              )
            ).status,
            200,
          );
        await close(running.server);
        running = undefined;
        const freshPool = new pg.Pool({
          connectionString,
          connectionTimeoutMillis: 5000,
        });
        const guard = await pool.connect();
        await guard.query("BEGIN");
        await guard.query(
          "SELECT id FROM engagement.reminders WHERE user_id<>ALL($1::uuid[]) AND status='scheduled' FOR UPDATE",
          [users],
        );
        try {
          await pool.query(
            "UPDATE engagement.reminders SET scheduled_at=now()-interval '1 second' WHERE user_id=$1 AND id=ANY($2::uuid[])",
            [sender, [reminder.id, cancelled.body.id]],
          );
          await Promise.all([
            deliverDueReminders(freshPool),
            deliverDueReminders(freshPool),
          ]);
          await deliverDueReminders(freshPool);
        } finally {
          await guard.query("ROLLBACK");
          guard.release();
          await freshPool.end();
        }
        running = await listen(pool);
        const saved = (await call("/api/reminders", sender)).body;
        assert.equal(
          saved.find((item) => item.id === reminder.id).status,
          "delivered",
        );
        assert.ok(saved.find((item) => item.id === reminder.id).deliveredAt);
        assert.equal(
          saved.find((item) => item.id === cancelled.body.id).status,
          "cancelled",
        );
        const notices = (await call("/api/notifications", sender)).body.filter(
          (notice) => notice.kind === "reminder",
        );
        assert.equal(notices.length, 1);
        assert.equal(notices[0].body, values.message);
        assert.equal(
          (await call("/api/reminders/" + reminder.id, sender, "DELETE"))
            .status,
          409,
        );
        assert.equal(
          (
            await pool.query(
              "SELECT count(*)::int count FROM engagement.deliveries d JOIN engagement.notifications n ON n.id=d.notification_id WHERE n.user_id=ANY($1::uuid[])",
              [users],
            )
          ).rows[0].count,
          0,
        );
      },
    );

    await t.test(
      "one push endpoint belongs to the latest account and carries no old queued delivery",
      async () => {
        const point = Buffer.alloc(65, 1);
        point[0] = 4;
        const subscription = {
          endpoint:
            "https://fcm.googleapis.com/fcm/send/engagement-test-" +
            randomUUID(),
          keys: {
            p256dh: point.toString("base64url"),
            auth: Buffer.alloc(16, 1).toString("base64url"),
          },
        };
        for (let i = 0; i < 2; i++)
          assert.equal(
            (
              await call("/api/push/subscriptions", sender, "POST", {
                subscription,
              })
            ).status,
            201,
          );
        const oldBinding = (
          await pool.query(
            "SELECT id,user_id FROM engagement.subscriptions WHERE endpoint=$1",
            [subscription.endpoint],
          )
        ).rows;
        assert.equal(oldBinding.length, 1);
        assert.equal(oldBinding[0].user_id, sender);
        const manual = await call(
          "/api/notifications/test",
          sender,
          "POST",
          {},
        );
        assert.equal(manual.status, 201);
        assert.equal(manual.body.pushQueued, 0);
        const pendingDeliveryId = randomUUID();
        await pool.query(
          "INSERT INTO engagement.deliveries(id,notification_id,subscription_id,next_attempt_at) VALUES($1,$2,$3,now()+interval '1 year')",
          [pendingDeliveryId, manual.body.id, oldBinding[0].id],
        );
        assert.equal(
          (
            await call("/api/push/subscriptions", receiver, "POST", {
              subscription,
            })
          ).status,
          201,
        );
        const bindings = (
          await pool.query(
            "SELECT user_id FROM engagement.subscriptions WHERE endpoint=$1",
            [subscription.endpoint],
          )
        ).rows;
        assert.deepEqual(bindings, [{ user_id: receiver }]);
        assert.equal(
          (
            await pool.query(
              "SELECT id FROM engagement.deliveries WHERE id=$1",
              [pendingDeliveryId],
            )
          ).rowCount,
          0,
        );
        assert.equal(
          (
            await call("/api/push/subscriptions", sender, "DELETE", {
              endpoint: subscription.endpoint,
            })
          ).status,
          200,
        );
        assert.deepEqual(
          (
            await pool.query(
              "SELECT user_id FROM engagement.subscriptions WHERE endpoint=$1",
              [subscription.endpoint],
            )
          ).rows,
          [{ user_id: receiver }],
        );
        assert.equal(
          (await call("/api/notifications/test", receiver, "POST", {})).body
            .pushQueued,
          0,
        );
        assert.equal(
          (
            await call("/api/push/subscriptions", receiver, "DELETE", {
              endpoint: subscription.endpoint,
            })
          ).status,
          200,
        );
      },
    );
  },
);
