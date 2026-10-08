import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { createBankingApp } from "../services/banking/src/app.ts";
import { HttpError } from "../packages/shared/http.ts";
import { migrate } from "../packages/shared/db.ts";
const integration = process.env.CARDO_BANKING_INTEGRATION === "1";
const internal = process.env.INTERNAL_TOKEN || "cardo-local-internal";
test("Student accounts, unique cards and atomic client banking", { skip: !integration }, async (t) => {
  const pool = new pg.Pool({ connectionString: process.env.TEST_BANKING_DATABASE_URL || "postgres://cardo_banking:cardo_banking_dev@127.0.0.1:5434/cardo" });
  const users = [
    { id: randomUUID(), name: "Студент Первый", phone: "+79998880001" },
    { id: randomUUID(), name: "Студент Второй", phone: "+79998880002" },
    { id: randomUUID(), name: "Студент Третий", phone: "+79998880003" },
    { id: randomUUID(), name: "Демо Клиент", phone: "+79998880004" },
  ];
  let customerUnavailable = false;
  let failOutbox = false;
  let membershipUnavailable = false;
  const premiumUsers = new Set();
  const memberships = {
    async current(userId) {
      if (membershipUnavailable) throw new HttpError(503, "MEMBERSHIP_UNAVAILABLE", "Тариф временно недоступен");
      const premium = premiumUsers.has(userId);
      return { premium, plan: premium ? "plus" : "standard", expiresAt: premium ? new Date(Date.now() + 86400000).toISOString() : null };
    },
  };
  await migrate(pool, new URL("../services/banking/migrations/001-initial.sql", import.meta.url));
  const customer = {
    async resolve(lookup) {
      if (customerUnavailable) throw new HttpError(503, "CUSTOMER_UNAVAILABLE", "Клиенты временно недоступны");
      const user = users.find((u) => "id" in lookup ? u.id === lookup.id : u.phone === lookup.phone);
      if (!user) throw new HttpError(404, "NOT_FOUND", "Клиент не найден");
      return user;
    },
  };
  const transactionalPool = {
    query: pool.query.bind(pool),
    async connect() {
      const client = await pool.connect();
      return {
        async query(sql, ...args) {
          if (failOutbox && String(sql).startsWith("INSERT INTO banking.outbox"))
            throw new Error("Synthetic outbox failure");
          return client.query(sql, ...args);
        },
        release() { client.release(); },
      };
    },
  };
  const app = createBankingApp(transactionalPool, { async quote() { throw new Error("Not used"); } }, customer, memberships);
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  const base = "http://127.0.0.1:" + server.address().port;
  async function request(user, path, body, key) {
    const response = await fetch(base + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Token": internal,
        "X-User-Id": user.id,
        "X-User-Name": encodeURIComponent(user.name),
        ...(key ? { "Idempotency-Key": key } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, data: await response.json() };
  }
  t.after(async () => {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
      server.closeIdleConnections();
    });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const table of ["recipients", "outbox", "receipts", "transactions", "limits", "cards", "accounts", "workspaces"])
        await client.query("DELETE FROM banking." + table + " WHERE user_id=ANY($1::uuid[])", [users.map((u) => u.id)]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
      await pool.end();
    }
  });
  let firstCards, secondCards, recipient, transfer, completedTransferKey;
  await t.test("new students start empty and demo provisioning is idempotent", async () => {
    firstCards = (await request(users[0], "/api/cards")).data;
    secondCards = (await request(users[1], "/api/cards")).data;
    assert.equal(firstCards.length, 3);
    assert.ok(firstCards.every((c) => c.balanceMinor === "0"));
    assert.deepEqual((await request(users[0], "/api/transactions")).data, []);
    assert.deepEqual((await request(users[0], "/api/contacts")).data, []);
    const demo = await request(users[3], "/internal/provision", { userId: users[3].id, name: users[3].name, demo: true });
    assert.equal(demo.data.created, true);
    const demoCards = (await request(users[3], "/api/cards")).data;
    assert.equal(demoCards[0].balanceMinor, "52109831");
    assert.ok((await request(users[3], "/api/transactions")).data.length > 40);
    assert.equal((await request(users[3], "/internal/provision", { userId: users[3].id, name: users[3].name, demo: true })).data.created, false);
    assert.deepEqual((await request(users[3], "/api/cards")).data, demoCards);
    const zero = await request(users[0], "/internal/provision", { userId: users[0].id, name: users[0].name, demo: true });
    assert.equal(zero.data.created, false);
    assert.deepEqual((await request(users[0], "/api/cards")).data, firstCards);
  });
  await t.test("three standard cards stay unique and further issuance is unavailable", async () => {
    const issued = await Promise.all(Array.from({ length: 4 }, () => request(users[0], "/api/cards", { currency: "RUB", tone: "lime" })));
    assert.ok(issued.every((r) => r.status === 404));
    assert.deepEqual((await request(users[0], "/api/cards")).data, firstCards);
    const rows = (await pool.query("SELECT regexp_replace(number,'[^0-9]','','g') number FROM banking.cards WHERE user_id=ANY($1::uuid[])", [users.map((u) => u.id)])).rows;
    assert.ok(rows.every((r) => /^\d{16}$/.test(r.number)));
    assert.equal(new Set(rows.map((r) => r.number)).size, rows.length);
  });
  await t.test("concurrent top-up retries have one ledger, receipt and outbox", async () => {
    const key = randomUUID();
    const body = { cardId: firstCards[0].id, amount: "1000.15" };
    const replies = await Promise.all(Array.from({ length: 5 }, () => request(users[0], "/api/top-ups", body, key)));
    assert.ok(replies.every((r) => r.status === 200));
    assert.equal(new Set(replies.map((r) => r.data.operationId)).size, 1);
    assert.equal(replies[0].data.balance, "1000.15");
    assert.equal((await request(users[0], "/api/top-ups", { ...body, amount: "1001" }, key)).status, 409);
    const transactions = (await request(users[0], "/api/transactions")).data;
    assert.equal(transactions.length, 1);
    assert.equal(transactions[0].amountMinor, "100015");
    const events = (await pool.query("SELECT payload FROM banking.outbox WHERE user_id=$1", [users[0].id])).rows;
    assert.equal(events.length, 1);
    assert.equal(events[0].payload.type, "banking.top-up.completed");
    const reused = await request(users[0], "/api/transfer", { cardId: firstCards[0].id, recipientId: "missing", amount: "1000.15" }, key);
    assert.equal(reused.data.error.code, "IDEMPOTENCY_CONFLICT");
    for (const amount of ["0", "-1", "1.001", "1000000.01"])
      assert.equal((await request(users[0], "/api/top-ups", { cardId: firstCards[0].id, amount }, randomUUID())).status, 422);
    assert.equal((await request(users[1], "/api/top-ups", { cardId: "missing", amount: "1" }, randomUUID())).status, 404);
  });
  await t.test("phone and card resolution save actual account contacts", async () => {
    const resolved = await request(users[0], "/api/recipients/resolve", { phone: "8 (999) 888-00-02" });
    assert.equal(resolved.status, 200);
    recipient = resolved.data;
    assert.equal(recipient.targetUserId, users[1].id);
    assert.equal(recipient.currency, "RUB");
    assert.equal(recipient.kind, "registered");
    const number = (await request(users[1], "/api/cards/" + secondCards[0].id + "/requisites")).data.number;
    const byCard = await request(users[0], "/api/recipients/resolve", { cardNumber: number.replaceAll(" ", "-") });
    assert.equal(byCard.status, 200);
    assert.equal(byCard.data.targetUserId, users[1].id);
    assert.equal((await request(users[0], "/api/contacts")).data.length, 2);
    assert.equal((await request(users[0], "/api/recipients/resolve", { phone: users[0].phone })).data.error.code, "SELF_TRANSFER");
    assert.equal((await request(users[0], "/api/recipients/resolve", { cardNumber: "1111222233334444" })).status, 404);
    assert.equal((await request(users[0], "/api/recipients/resolve", { phone: users[1].phone, cardNumber: number })).status, 422);
  });
  await t.test("concurrent transfer retries credit the receiver once and link both operations", async () => {
    const key = randomUUID();
    const body = { cardId: firstCards[0].id, recipientId: recipient.id, amount: "10.15" };
    const replies = await Promise.all(Array.from({ length: 5 }, () => request(users[0], "/api/transfer", body, key)));
    assert.ok(replies.every((r) => r.status === 200), JSON.stringify(replies));
    assert.equal(new Set(replies.map((r) => r.data.transferId)).size, 1);
    transfer = replies[0].data;
    completedTransferKey = key;
    assert.notEqual(transfer.senderOperationId, transfer.receiverOperationId);
    assert.equal(transfer.fee, "500.00");
    assert.equal(transfer.feeMinor, "50000");
    assert.equal(transfer.totalDebit, "510.15");
    assert.equal(transfer.totalDebitMinor, "51015");
    assert.equal(transfer.plan, "standard");
    assert.equal((await request(users[0], "/api/transfer/fee")).data.feeMinor, "50000");
    assert.equal((await request(users[0], "/api/cards")).data[0].balanceMinor, "49000");
    assert.equal((await request(users[1], "/api/cards")).data[0].balanceMinor, "1015");
    assert.equal((await request(users[0], "/api/transactions/" + transfer.senderOperationId)).data.amountMinor, "-1015");
    const senderOperation = (await request(users[0], "/api/transactions/" + transfer.senderOperationId)).data;
    assert.equal(senderOperation.feeMinor, "50000");
    assert.equal(senderOperation.totalDebitMinor, "51015");
    const feeOperation = (await request(users[0], "/api/transactions/" + transfer.feeOperationId)).data;
    assert.equal(feeOperation.cat, "c.fee");
    assert.equal(feeOperation.amountMinor, "-50000");
    assert.equal(feeOperation.transferId, transfer.transferId);
    assert.equal((await request(users[0], "/api/transactions")).data.length, 3);
    assert.equal((await request(users[1], "/api/transactions/" + transfer.receiverOperationId)).data.amountMinor, "1015");
    assert.equal((await request(users[0], "/api/transactions/" + transfer.receiverOperationId)).status, 404);
    const event = (await pool.query("SELECT payload FROM banking.outbox WHERE user_id=$1 AND payload->>'type'='banking.transfer.completed'", [users[0].id])).rows[0].payload;
    assert.equal(event.version, 2);
    assert.equal(event.payload.receiverOperationId, transfer.receiverOperationId);
    assert.equal(event.payload.receiverUserId, users[1].id);
    assert.equal((await request(users[0], "/api/transfer", { ...body, amount: "11" }, key)).status, 409);
  });
  await t.test("frozen recipient, currency mismatch and insufficient funds preserve money", async () => {
    const before = (await request(users[0], "/api/cards")).data;
    await request(users[1], "/api/cards/" + secondCards[0].id + "/freeze", { frozen: true });
    const body = { cardId: firstCards[0].id, recipientId: recipient.id, amount: "1" };
    assert.equal((await request(users[0], "/api/transfer", body, randomUUID())).data.error.code, "RECIPIENT_CARD_FROZEN");
    await request(users[1], "/api/cards/" + secondCards[0].id + "/freeze", { frozen: false });
    assert.equal((await request(users[0], "/api/transfer", { ...body, cardId: firstCards[1].id }, randomUUID())).data.error.code, "CURRENCY_MISMATCH");
    assert.equal((await request(users[0], "/api/transfer", { ...body, amount: "9999" }, randomUUID())).data.error.code, "INSUFFICIENT_FUNDS");
    assert.deepEqual((await request(users[0], "/api/cards")).data, before);
  });
  await t.test("opposing concurrent transfers serialize without deadlock or lost money", async () => {
    for (const [user, card] of [[users[0], firstCards[0]], [users[1], secondCards[0]]])
      assert.equal((await request(user, "/api/top-ups", { cardId: card.id, amount: "1000" }, randomUUID())).status, 200);
    const firstBefore = BigInt((await request(users[0], "/api/cards")).data[0].balanceMinor);
    const secondBefore = BigInt((await request(users[1], "/api/cards")).data[0].balanceMinor);
    const reverse = (await request(users[1], "/api/recipients/resolve", { phone: users[0].phone })).data;
    const results = await Promise.all([
      request(users[0], "/api/transfer", { cardId: firstCards[0].id, recipientId: recipient.id, amount: "1" }, randomUUID()),
      request(users[1], "/api/transfer", { cardId: secondCards[0].id, recipientId: reverse.id, amount: "1" }, randomUUID()),
    ]);
    assert.ok(results.every((r) => r.status === 200), JSON.stringify(results));
    assert.equal(BigInt((await request(users[0], "/api/cards")).data[0].balanceMinor), firstBefore - 50000n);
    assert.equal(BigInt((await request(users[1], "/api/cards")).data[0].balanceMinor), secondBefore - 50000n);
  });
  await t.test("incoming transfer never offsets daily outgoing usage", async () => {
    await pool.query("UPDATE banking.limits SET value=2 WHERE user_id=$1 AND id='transfer'", [users[1].id]);
    const reverse = (await request(users[1], "/api/contacts")).data[0];
    const response = await request(users[1], "/api/transfer", { cardId: secondCards[0].id, recipientId: reverse.id, amount: "1.01" }, randomUUID());
    assert.equal(response.data.error.code, "LIMIT_EXCEEDED");
  });
  await t.test("a changed card number makes the saved contact outdated", async () => {
    const number = (await request(users[1], "/api/cards/" + secondCards[0].id + "/requisites")).data.number;
    const contact = (await request(users[0], "/api/recipients/resolve", { cardNumber: number })).data;
    await pool.query("UPDATE banking.cards SET number=banking.next_card_number() WHERE user_id=$1 AND id=$2", [users[1].id, secondCards[0].id]);
    const before = (await request(users[0], "/api/cards")).data;
    const response = await request(users[0], "/api/transfer", { cardId: firstCards[0].id, recipientId: contact.id, amount: "1" }, randomUUID());
    assert.equal(response.data.error.code, "OUTDATED_RECIPIENT");
    assert.deepEqual((await request(users[0], "/api/cards")).data, before);
  });
  await t.test("a frozen sender rejects top-up and transfer without partial changes", async () => {
    await request(users[0], "/api/cards/" + firstCards[0].id + "/freeze", { frozen: true });
    const before = (await request(users[0], "/api/cards")).data;
    assert.equal((await request(users[0], "/api/top-ups", { cardId: firstCards[0].id, amount: "1" }, randomUUID())).data.error.code, "CARD_FROZEN");
    assert.equal((await request(users[0], "/api/transfer", { cardId: firstCards[0].id, recipientId: recipient.id, amount: "1" }, randomUUID())).data.error.code, "CARD_FROZEN");
    assert.deepEqual((await request(users[0], "/api/cards")).data, before);
    await request(users[0], "/api/cards/" + firstCards[0].id + "/freeze", { frozen: false });
  });
  await t.test("completed transfers replay during a Customer outage; new ones leave balances unchanged", async () => {
    const before = (await request(users[0], "/api/cards")).data;
    const body = { cardId: firstCards[0].id, recipientId: recipient.id, amount: "10.15" };
    customerUnavailable = true;
    try {
      const saved = await request(users[0], "/api/transfer", body, completedTransferKey);
      assert.equal(saved.status, 200);
      assert.deepEqual(saved.data, transfer);
      assert.equal((await request(users[0], "/api/transfer", body, randomUUID())).status, 503);
      assert.deepEqual((await request(users[0], "/api/cards")).data, before);
    } finally {
      customerUnavailable = false;
    }
  });
  await t.test("an outbox failure rolls back the balance, operation and receipt together", async () => {
    const before = (await request(users[0], "/api/cards")).data;
    const history = (await request(users[0], "/api/transactions")).data;
    const key = randomUUID();
    failOutbox = true;
    try {
      const response = await request(users[0], "/api/top-ups", { cardId: firstCards[0].id, amount: "1" }, key);
      assert.equal(response.status, 500);
    } finally {
      failOutbox = false;
    }
    assert.deepEqual((await request(users[0], "/api/cards")).data, before);
    assert.deepEqual((await request(users[0], "/api/transactions")).data, history);
    assert.equal((await pool.query("SELECT key FROM banking.receipts WHERE user_id=$1 AND key=$2", [users[0].id, key])).rowCount, 0);
  });
  await t.test("Plus fees, tariff changes, insufficient total and saved replay are authoritative", async () => {
    const user = users[2];
    const card = (await request(user, "/api/cards")).data[0];
    const target = (await request(user, "/api/recipients/resolve", { phone: users[1].phone })).data;
    assert.equal((await request(user, "/api/top-ups", { cardId: card.id, amount: "1000" }, randomUUID())).data.balance, "1000.00");
    premiumUsers.add(user.id);
    assert.deepEqual((await request(user, "/api/transfer/fee")).data, { fee: "100.00", feeMinor: "10000", currency: "RUB", plan: "plus" });
    const plusRejected = await request(user, "/api/transfer", { cardId: card.id, recipientId: target.id, amount: "950" }, randomUUID());
    assert.equal(plusRejected.data.error.code, "INSUFFICIENT_FUNDS");
    assert.deepEqual(plusRejected.data.error.details, { amount: "950.00", fee: "100.00", totalDebit: "1050.00", balance: "1000.00", currency: "RUB" });
    assert.equal((await request(user, "/api/cards")).data[0].balanceMinor, "100000");
    assert.equal((await request(user, "/api/transactions")).data.length, 1);
    const key = randomUUID();
    const body = { cardId: card.id, recipientId: target.id, amount: "200", fee: "0", plan: "standard" };
    const receiverBefore = BigInt((await request(users[1], "/api/cards")).data[0].balanceMinor);
    const sent = await request(user, "/api/transfer", body, key);
    assert.equal(sent.status, 200);
    assert.equal(sent.data.fee, "100.00");
    assert.equal(sent.data.totalDebit, "300.00");
    assert.equal(sent.data.balance, "700.00");
    assert.equal(sent.data.plan, "plus");
    assert.equal(BigInt((await request(users[1], "/api/cards")).data[0].balanceMinor), receiverBefore + 20000n);
    premiumUsers.delete(user.id);
    const before = (await request(user, "/api/cards")).data;
    const history = (await request(user, "/api/transactions")).data;
    membershipUnavailable = true;
    try {
      assert.deepEqual((await request(user, "/api/transfer", body, key)).data, sent.data);
      assert.equal((await request(user, "/api/transfer", body, randomUUID())).status, 503);
      assert.equal((await request(user, "/api/transfer/fee")).status, 503);
      assert.deepEqual((await request(user, "/api/cards")).data, before);
      assert.deepEqual((await request(user, "/api/transactions")).data, history);
    } finally {
      membershipUnavailable = false;
    }
    assert.deepEqual((await request(user, "/api/transfer", body, key)).data, sent.data);
    const rejected = await request(user, "/api/transfer", { ...body, amount: "300" }, randomUUID());
    assert.equal(rejected.data.error.code, "INSUFFICIENT_FUNDS");
    assert.deepEqual(rejected.data.error.details, { amount: "300.00", fee: "500.00", totalDebit: "800.00", balance: "700.00", currency: "RUB" });
    assert.deepEqual((await request(user, "/api/cards")).data, before);
    assert.deepEqual((await request(user, "/api/transactions")).data, history);
    const exact = await request(user, "/api/transfer", body, randomUUID());
    assert.equal(exact.status, 200);
    assert.equal(exact.data.plan, "standard");
    assert.equal(exact.data.fee, "500.00");
    assert.equal(exact.data.totalDebit, "700.00");
    assert.equal(exact.data.balance, "0.00");
    assert.equal((await request(user, "/api/transactions/" + sent.data.senderOperationId)).data.feeMinor, "10000");
    assert.equal((await request(user, "/api/transactions/" + exact.data.senderOperationId)).data.feeMinor, "50000");
  });
  await t.test("balance is opening balance plus complete signed ledger", async () => {
    const rows = (await pool.query("SELECT a.user_id,a.balance_minor,a.opening_balance_minor,coalesce(sum(t.amount_minor),0)::text total FROM banking.accounts a LEFT JOIN banking.transactions t ON t.user_id=a.user_id AND t.account_id=a.id WHERE a.user_id=ANY($1::uuid[]) GROUP BY a.user_id,a.id", [users.map((u) => u.id)])).rows;
    for (const row of rows)
      assert.equal(BigInt(row.balance_minor), BigInt(row.opening_balance_minor) + BigInt(row.total));
  });
});
