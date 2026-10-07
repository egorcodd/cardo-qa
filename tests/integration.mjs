import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomInt } from "node:crypto";
import pg from "pg";
const base = process.env.TEST_URL || "http://127.0.0.1:8942";
const db = new pg.Pool({
  connectionString:
    process.env.TEST_DATABASE_URL ||
    "postgres://cardo:cardo_local_dev@127.0.0.1:5434/cardo",
});
async function req(path, { token, method = "GET", body, headers = {} } = {}) {
  const res = await fetch(base + "/api" + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: "Bearer " + token } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, body: await res.json(), headers: res.headers };
}
async function register() {
  const phone = "+79" + String(randomInt(100000000, 999999999));
  const r = await req("/auth/register", {
    method: "POST",
    body: { phone, password: "Cardo12345", confirmPassword: "Cardo12345" },
  });
  assert.equal(r.status, 201);
  return { phone, token: r.body.token, user: r.body.user };
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
test("Cardo services and persistent banking workflows", async (t) => {
  const user = await register(),
    other = await register();
  await t.test(
    "registration, normalization, duplicate, cookie and login",
    async () => {
      const duplicate = await req("/auth/register", {
        method: "POST",
        body: { phone: user.phone.replace("+7", "8"), password: "Cardo12345" },
      });
      assert.equal(duplicate.status, 409);
      const wrong = await req("/auth/login", {
        method: "POST",
        body: { phone: user.phone, password: "Wrong12345" },
      });
      assert.equal(wrong.status, 401);
      const login = await req("/auth/login", {
        method: "POST",
        body: { phone: user.phone, password: "Cardo12345" },
      });
      assert.equal(login.status, 200);
      assert.match(
        login.headers.get("set-cookie"),
        /HttpOnly; SameSite=Strict/,
      );
      const invalid = await req("/auth/register", {
        method: "POST",
        body: { phone: "7999", password: "abc" },
      });
      assert.equal(invalid.status, 422);
      const mismatch = await req("/auth/register", {
        method: "POST",
        body: {
          phone: "+79998887777",
          password: "Cardo12345",
          confirmPassword: "different",
        },
      });
      assert.equal(mismatch.status, 422);
    },
  );
  let cards, contacts;
  await t.test("session initialization and boundary isolation", async () => {
    assert.equal((await req("/cards")).status, 401);
    cards = (await req("/cards", { token: user.token })).body;
    contacts = (await req("/contacts", { token: user.token })).body;
    assert.equal(cards.length, 3);
    assert.equal(contacts.length, 16);
    const otherCards = (await req("/cards", { token: other.token })).body;
    assert.equal(otherCards[0].balanceMinor, cards[0].balanceMinor);
    const spoof = await req("/profile", {
      token: user.token,
      headers: { "X-User-Id": other.user.id, "X-Internal-Token": "forged" },
    });
    assert.equal(spoof.body.id, user.user.id);
    const unique = (
      await req("/cards", {
        token: user.token,
        method: "POST",
        body: { currency: "USD", tone: "dark" },
      })
    ).body;
    assert.match(unique.id, /^k/);
    assert.equal(
      (await req("/cards/" + unique.id + "/requisites", { token: other.token }))
        .status,
      404,
    );
    assert.equal(
      (
        await req("/cards/" + unique.id + "/freeze", {
          token: other.token,
          method: "POST",
          body: { frozen: true },
        })
      ).status,
      404,
    );
    assert.equal(
      (
        await req("/settings", {
          token: other.token,
          method: "PUT",
          body: { mainCardId: unique.id },
        })
      ).status,
      404,
    );
    assert.equal(
      (
        await req("/settings", {
          token: user.token,
          method: "PUT",
          body: { mainCardId: unique.id, theme: "dark", language: "en" },
        })
      ).status,
      200,
    );
    assert.equal(
      (await req("/settings", { token: user.token })).body.mainCardId,
      unique.id,
    );
  });
  let transfer;
  await t.test(
    "exact cents, concurrent replay and conflicting key",
    async () => {
      const key = randomUUID(),
        value = {
          cardId: cards[0].id,
          recipientId: contacts[0].id,
          amount: "10.15",
        };
      const replies = await Promise.all(
        Array.from({ length: 5 }, () =>
          req("/transfer", {
            token: user.token,
            method: "POST",
            body: value,
            headers: { "Idempotency-Key": key },
          }),
        ),
      );
      replies.forEach((r) => assert.equal(r.status, 200));
      assert.equal(new Set(replies.map((r) => r.body.transferId)).size, 1);
      transfer = replies[0].body;
      const next = (await req("/cards", { token: user.token })).body[0];
      assert.equal(
        BigInt(next.balanceMinor),
        BigInt(cards[0].balanceMinor) - 1015n,
      );
      const conflict = await req("/transfer", {
        token: user.token,
        method: "POST",
        body: { ...value, amount: "11" },
        headers: { "Idempotency-Key": key },
      });
      assert.equal(conflict.status, 409);
      const untouched = (await req("/cards", { token: other.token })).body[0];
      assert.equal(untouched.balanceMinor, cards[0].balanceMinor);
    },
  );
  await t.test(
    "frozen card, invalid amount, unknown recipient leave no debit",
    async () => {
      const before = (await req("/cards", { token: user.token })).body[0];
      assert.equal(
        (
          await req("/cards/" + before.id + "/freeze", {
            token: user.token,
            method: "POST",
            body: { frozen: true },
          })
        ).status,
        200,
      );
      const send = (body) =>
        req("/transfer", {
          token: user.token,
          method: "POST",
          headers: { "Idempotency-Key": randomUUID() },
          body: {
            cardId: before.id,
            recipientId: contacts[0].id,
            amount: "1",
            ...body,
          },
        });
      assert.equal((await send({})).body.error.code, "CARD_FROZEN");
      await req("/cards/" + before.id + "/freeze", {
        token: user.token,
        method: "POST",
        body: { frozen: false },
      });
      for (const amount of ["-1", "0", "1.001", "1e9"])
        assert.equal((await send({ amount })).status, 422);
      assert.equal((await send({ recipientId: "missing" })).status, 404);
      assert.equal(
        (await send({ amount: "9999999" })).body.error.code,
        "INSUFFICIENT_FUNDS",
      );
      assert.equal(
        (await req("/cards", { token: user.token })).body[0].balanceMinor,
        before.balanceMinor,
      );
    },
  );
  await t.test("limits are stored and applied atomically", async () => {
    assert.equal(
      (
        await req("/limits", {
          token: user.token,
          method: "PUT",
          body: { single: 1000 },
        })
      ).status,
      200,
    );
    const r = await req("/transfer", {
      token: user.token,
      method: "POST",
      body: {
        cardId: cards[0].id,
        recipientId: contacts[0].id,
        amount: "1001",
      },
      headers: { "Idempotency-Key": randomUUID() },
    });
    assert.equal(r.body.error.code, "LIMIT_EXCEEDED");
    assert.equal(
      (await req("/limits", { token: user.token })).body.find(
        (l) => l.id === "single",
      ).value,
      1000,
    );
  });
  await t.test(
    "event delivery, inbox deduplication, rewards and notifications",
    async () => {
      let notices = [];
      for (let i = 0; i < 20; i++) {
        notices = (await req("/notifications", { token: user.token })).body;
        if (notices.some((n) => n.url === "/history/" + transfer.transferId))
          break;
        await sleep(300);
      }
      const n = notices.find(
        (n) => n.url === "/history/" + transfer.transferId,
      );
      assert.ok(n);
      const outbox = (
        await db.query(
          "SELECT * FROM banking.outbox WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1",
          [user.user.id],
        )
      ).rows[0];
      assert.ok(outbox.delivered_at);
      const duplicate = await fetch("http://127.0.0.1:8083/internal/events", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Internal-Token":
            process.env.INTERNAL_TOKEN || "cardo-local-internal",
        },
        body: JSON.stringify(outbox.payload),
      });
      assert.equal(duplicate.status, 200);
      const rewards = (await req("/rewards", { token: user.token })).body;
      assert.equal(rewards.balance, 105);
      const results = await Promise.all(
        [1, 2].map(() =>
          req("/rewards/plus/claim", {
            token: user.token,
            method: "POST",
            body: {},
          }),
        ),
      );
      assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
      assert.equal(
        (await req("/rewards", { token: user.token })).body.balance,
        5,
      );
      assert.equal(
        (
          await req("/notifications/" + n.id + "/read", {
            token: other.token,
            method: "PATCH",
            body: {},
          })
        ).status,
        404,
      );
      assert.equal(
        (
          await req("/notifications/" + n.id + "/read", {
            token: user.token,
            method: "PATCH",
            body: {},
          })
        ).status,
        200,
      );
      assert.equal(
        (await req("/notifications", { token: user.token })).body.find(
          (item) => item.id === n.id,
        ).read,
        true,
      );
    },
  );
  await t.test(
    "independent transfer operations have separate receipts",
    async () => {
      const value = {
        cardId: cards[0].id,
        recipientId: contacts[0].id,
        amount: "0.01",
      };
      const before = (await req("/cards", { token: user.token })).body[0];
      const a = await req("/transfer", {
        token: user.token,
        method: "POST",
        body: value,
        headers: { "Idempotency-Key": randomUUID() },
      });
      const b = await req("/transfer", {
        token: user.token,
        method: "POST",
        body: value,
        headers: { "Idempotency-Key": randomUUID() },
      });
      assert.equal(a.status, 200);
      assert.equal(b.status, 200);
      assert.notEqual(a.body.transferId, b.body.transferId);
      assert.equal(
        BigInt(
          (await req("/cards", { token: user.token })).body[0].balanceMinor,
        ),
        BigInt(before.balanceMinor) - 2n,
      );
    },
  );
  await t.test(
    "API rejects cross-origin and local push endpoints",
    async () => {
      assert.equal(
        (
          await req("/profile", {
            token: user.token,
            headers: { Origin: "https://other.example" },
          })
        ).status,
        403,
      );
      const push = await req("/push/subscriptions", {
        token: user.token,
        method: "POST",
        body: {
          subscription: {
            endpoint: "https://127.0.0.1/secret",
            keys: { p256dh: "a", auth: "b" },
          },
        },
      });
      assert.equal(push.status, 422);
      const ping = await req("/notifications/test", {
        token: user.token,
        method: "POST",
        body: {},
      });
      assert.equal(ping.status, 201);
      assert.equal(ping.body.pushQueued, 0);
      assert.equal(
        (await req("/push/config", { token: user.token })).body.publicKey
          .length,
        87,
      );
    },
  );
  await t.test(
    "database balances reconcile with ledger and passwords are hashed",
    async () => {
      const rows = (
        await db.query(
          "SELECT a.balance_minor,a.opening_balance_minor,coalesce(sum(t.amount_minor),0)::text total FROM banking.accounts a LEFT JOIN banking.transactions t ON t.user_id=a.user_id AND t.account_id=a.id WHERE a.user_id=$1 GROUP BY a.user_id,a.id",
          [user.user.id],
        )
      ).rows;
      rows.forEach((row) =>
        assert.equal(
          BigInt(row.balance_minor),
          BigInt(row.opening_balance_minor) + BigInt(row.total),
        ),
      );
      const hashed = (
        await db.query("SELECT password_hash FROM customer.users WHERE id=$1", [
          user.user.id,
        ])
      ).rows[0].password_hash;
      assert.match(hashed, /^[a-f0-9]{32}:[a-f0-9]{128}$/);
      assert.ok(!hashed.includes("Cardo12345"));
    },
  );
  await t.test(
    "logout revokes current token and later login keeps data",
    async () => {
      const before = (await req("/cards", { token: user.token })).body;
      assert.equal(
        (
          await req("/auth/logout", {
            token: user.token,
            method: "POST",
            body: {},
          })
        ).status,
        200,
      );
      assert.equal((await req("/profile", { token: user.token })).status, 401);
      const login = await req("/auth/login", {
        method: "POST",
        body: { phone: user.phone, password: "Cardo12345" },
      });
      assert.deepEqual(
        (await req("/cards", { token: login.body.token })).body,
        before,
      );
      assert.equal(
        (await req("/settings", { token: login.body.token })).body.theme,
        "dark",
      );
    },
  );
  await db.end();
});
