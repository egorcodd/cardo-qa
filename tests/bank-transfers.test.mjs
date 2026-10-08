import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { createServer } from "node:http";
import pg from "pg";
import { createBankingApp } from "../services/banking/src/app.ts";
import {
  banks,
  resolveBank,
  recipientReference,
} from "../services/banking/src/banks.ts";
import { HttpError } from "../packages/shared/http.ts";
import {
  externalRecipients,
  findExternalRecipient,
} from "../services/banking/fixtures/external-recipients.ts";
import { shortRecipientName } from "../services/banking/src/recipient-name.ts";
import openapi from "../services/gateway/openapi.ts";
import { migrate } from "../packages/shared/db.ts";
import { createMembershipClient } from "../services/banking/src/integrations/membership.ts";
import { transferFee } from "../services/banking/src/transfer-fees.ts";
test("Transfer tariffs use authenticated membership and reject unavailable or invalid responses", async (t) => {
  const userId = randomUUID();
  let value = { premium: true, plan: "plus", expiresAt: new Date(Date.now() + 86400000).toISOString() };
  let status = 200;
  let requestHeaders;
  const server = createServer((req, res) => {
    requestHeaders = req.headers;
    assert.equal(req.url, "/api/membership");
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(value));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    await new Promise((resolve) => {
      server.close(resolve);
      server.closeIdleConnections();
    });
  });
  const client = createMembershipClient("http://127.0.0.1:" + server.address().port);
  assert.equal(transferFee(await client.current(userId, "fee-contract-check")).feeMinor, "10000");
  assert.equal(requestHeaders["x-user-id"], userId);
  assert.equal(requestHeaders["x-request-id"], "fee-contract-check");
  assert.equal(requestHeaders["x-internal-token"], process.env.INTERNAL_TOKEN || "cardo-local-internal");
  value = { premium: true, plan: "plus", expiresAt: new Date(Date.now() - 1000).toISOString() };
  assert.deepEqual(transferFee(await client.current(userId, "expired-fee")), { fee: "500.00", feeMinor: "50000", currency: "RUB", plan: "standard" });
  for (const invalid of [null, { premium: "true", plan: "plus", expiresAt: null }, { premium: true, plan: "standard", expiresAt: value.expiresAt }, { premium: true, plan: "plus", expiresAt: "tomorrow" }, { premium: false, plan: "standard", expiresAt: value.expiresAt }]) {
    value = invalid;
    await assert.rejects(client.current(userId, "bad-fee"), (error) => error.status === 503 && error.code === "MEMBERSHIP_UNAVAILABLE");
  }
  value = { premium: false, plan: "standard", expiresAt: null };
  status = 503;
  await assert.rejects(client.current(userId, "unavailable-fee"), (error) => error.status === 503 && error.code === "MEMBERSHIP_UNAVAILABLE");
});
test("Bank catalog only accepts known IDs and masks phone/card references", () => {
  assert.deepEqual(
    banks.map((bank) => bank.id),
    [
      "cardo",
      "tbank",
      "vtb",
      "tochka",
      "revolut",
      "wise",
      "sber",
      "alfa",
      "gazprombank",
      "raiffeisen",
      "sovcombank",
      "ozon",
    ],
  );
  assert.equal(resolveBank().id, "cardo");
  assert.deepEqual(
    banks.filter((bank) => bank.favorite).map((bank) => bank.id),
    ["cardo"],
  );
  for (const bank of banks) assert.equal(typeof bank.favorite, "boolean");
  assert.equal(resolveBank("tbank").name, "Т-Банк");
  for (const value of [null, "unknown", "__proto__", {}, 1])
    assert.throws(
      () => resolveBank(value),
      (error) =>
        error instanceof HttpError &&
        error.status === 422 &&
        error.code === "INVALID_BANK",
    );
  assert.equal(recipientReference("phone", "+79997771002"), "+7 ••• •••-1002");
  assert.equal(recipientReference("card", "9999 1000 0000 1002"), "•••• 1002");
});
test("External directory requires the selected bank and shortens only display names", () => {
  assert.equal(externalRecipients.length, 22);
  assert.equal(
    new Set(externalRecipients.map((recipient) => recipient.phone)).size,
    22,
  );
  assert.equal(
    new Set(externalRecipients.map((recipient) => recipient.cardNumber)).size,
    22,
  );
  for (const recipient of externalRecipients) {
    assert.match(recipient.phone, /^\+79\d{9}$/);
    assert.match(recipient.cardNumber, /^\d{16}$/);
    const checksum = [...recipient.cardNumber].reduce((sum, char, index) => {
      let digit = Number(char);
      if (index % 2 === 0) digit *= 2;
      return sum + (digit > 9 ? digit - 9 : digit);
    }, 0);
    assert.equal(checksum % 10, 0);
    for (const bank of banks.filter((bank) => bank.id !== recipient.bankId)) {
      assert.equal(
        findExternalRecipient(bank.id, "phone", recipient.phone),
        undefined,
      );
      assert.equal(
        findExternalRecipient(bank.id, "card", recipient.cardNumber),
        undefined,
      );
    }
    assert.equal(
      findExternalRecipient(recipient.bankId, "phone", recipient.phone),
      recipient,
    );
    assert.equal(
      findExternalRecipient(recipient.bankId, "card", recipient.cardNumber),
      recipient,
    );
    assert.equal(
      findExternalRecipient("cardo", "phone", recipient.phone),
      undefined,
    );
    assert.equal(
      findExternalRecipient(recipient.bankId, "phone", "+79997771099"),
      undefined,
    );
  }
  assert.equal(
    findExternalRecipient("vtb", "phone", externalRecipients[0].phone),
    undefined,
  );
  assert.equal(shortRecipientName("Анна Иванова"), "Анна И.");
  assert.equal(shortRecipientName("Егор"), "Егор");
  assert.equal(shortRecipientName("  Мария   Волкова  "), "Мария В.");
});
test("OpenAPI includes every bank and the default favorite metadata", () => {
  const catalog =
    openapi.paths["/banks"].get.responses["200"].content["application/json"];
  assert.deepEqual(catalog.example, banks);
  assert.deepEqual(catalog.schema.items.required, ["id", "name", "favorite"]);
  assert.deepEqual(
    catalog.schema.items.properties.id.enum,
    banks.map((bank) => bank.id),
  );
  const lookup =
    openapi.paths["/recipients/resolve"].post.requestBody.content[
      "application/json"
    ];
  assert.deepEqual(
    lookup.schema.oneOf[0].properties.bankId.enum,
    banks.map((bank) => bank.id),
  );
  assert.equal(
    lookup.examples.sber.value.phone,
    externalRecipients.find((recipient) => recipient.bankId === "sber").phone,
  );
  assert.equal(
    lookup.examples.alfa.value.cardNumber,
    externalRecipients.find((recipient) => recipient.bankId === "alfa")
      .cardNumber,
  );
  assert.deepEqual(
    openapi.paths["/recipients/examples"].get.parameters[0].schema.enum,
    banks.map((bank) => bank.id),
  );
});
const integration = process.env.CARDO_BANKING_INTEGRATION === "1";
const internal = process.env.INTERNAL_TOKEN || "cardo-local-internal";
test(
  "Bank-aware transfers remain atomic and never credit Cardo for external banks",
  { skip: !integration },
  async (t) => {
    const pool = new pg.Pool({
      connectionString:
        process.env.TEST_BANKING_DATABASE_URL ||
        "postgres://cardo_banking:cardo_banking_dev@127.0.0.1:5434/cardo",
    });
    const users = [
      { id: randomUUID(), name: "Отправитель Банков", phone: "+79997771001" },
      {
        id: randomUUID(),
        name: "Мария Волкова",
        phone: externalRecipients[0].phone,
      },
    ];
    let customerCalls = 0;
    let customerUnavailable = false;
    let failOutbox = false;
    let premium = false;
    const memberships = {
      async current() {
        return { premium, plan: premium ? "plus" : "standard", expiresAt: premium ? new Date(Date.now() + 86400000).toISOString() : null };
      },
    };
    await migrate(pool, new URL("../services/banking/migrations/001-initial.sql", import.meta.url));
    const customer = {
      async resolve(lookup) {
        customerCalls++;
        if (customerUnavailable)
          throw new HttpError(
            503,
            "CUSTOMER_UNAVAILABLE",
            "Клиенты временно недоступны",
          );
        const user = users.find((user) =>
          "id" in lookup ? user.id === lookup.id : user.phone === lookup.phone,
        );
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
            if (
              failOutbox &&
              String(sql).startsWith("INSERT INTO banking.outbox")
            )
              throw new Error("Synthetic outbox failure");
            return client.query(sql, ...args);
          },
          release() {
            client.release();
          },
        };
      },
    };
    const app = createBankingApp(
      transactionalPool,
      {
        async quote() {
          throw new Error("Not used");
        },
      },
      customer,
      memberships,
    );
    const server = await new Promise((resolve) => {
      const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
    });
    const base = "http://127.0.0.1:" + server.address().port;
    async function request(user, route, body, key) {
      const response = await fetch(base + route, {
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
    const sender = users[0],
      receiver = users[1];
    const cards = async (user) => (await request(user, "/api/cards")).data;
    const history = async (user) =>
      (await request(user, "/api/transactions")).data;
    const balance = async (user) => BigInt((await cards(user))[0].balanceMinor);
    const send = (
      recipient,
      amount,
      key = randomUUID(),
      card = senderCards[0],
      extra = {},
    ) =>
      request(
        sender,
        "/api/transfer",
        { cardId: card.id, recipientId: recipient.id, amount, ...extra },
        key,
      );
    t.after(async () => {
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeIdleConnections();
      });
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        for (const table of [
          "recipients",
          "outbox",
          "receipts",
          "transactions",
          "limits",
          "cards",
          "accounts",
          "workspaces",
        ])
          await client.query(
            "DELETE FROM banking." + table + " WHERE user_id=ANY($1::uuid[])",
            [users.map((user) => user.id)],
          );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
        await pool.end();
      }
    });
    let senderCards,
      receiverCards,
      internalRecipient,
      tbankRecipient,
      vtbRecipient,
      receiverNumber;
    await t.test(
      "catalog, zero starting balance and unchanged non-transfer history",
      async () => {
        assert.deepEqual((await request(sender, "/api/banks")).data, banks);
        senderCards = await cards(sender);
        receiverCards = await cards(receiver);
        assert.equal(await balance(sender), 0n);
        assert.equal(await balance(receiver), 0n);
        assert.equal(
          (
            await request(
              sender,
              "/api/top-ups",
              { cardId: senderCards[0].id, amount: "10000" },
              randomUUID(),
            )
          ).status,
          200,
        );
        const topUp = (await history(sender))[0];
        assert.equal(topUp.amountMinor, "1000000");
        assert.equal(Object.hasOwn(topUp, "bankId"), false);
        receiverNumber = (
          await request(
            receiver,
            "/api/cards/" + receiverCards[0].id + "/requisites",
          )
        ).data.number;
      },
    );
    await t.test(
      "unknown banks and malformed requisites do not create contacts",
      async () => {
        const before = (await request(sender, "/api/contacts")).data;
        for (const body of [
          { bankId: "unknown", phone: receiver.phone },
          { bankId: null, phone: receiver.phone },
          { bankId: "tbank", phone: "123" },
          { bankId: "vtb", cardNumber: "123" },
          { bankId: "wise", phone: receiver.phone, cardNumber: receiverNumber },
        ])
          assert.equal(
            (await request(sender, "/api/recipients/resolve", body)).status,
            422,
          );
        assert.deepEqual((await request(sender, "/api/contacts")).data, before);
        assert.equal(customerCalls, 0);
      },
    );
    await t.test(
      "default Cardo lookups reuse existing saved recipient IDs",
      async () => {
        const resolved = await request(sender, "/api/recipients/resolve", {
          phone: receiver.phone,
        });
        assert.equal(resolved.status, 200);
        assert.equal(resolved.data.targetUserId, receiver.id);
        assert.equal(resolved.data.bankId, "cardo");
        assert.equal(resolved.data.lookupType, "phone");
        assert.equal(resolved.data.reference, receiver.phone);
        assert.equal(resolved.data.lookupValue, receiver.phone);
        assert.equal(resolved.data.name, "Мария В.");
        const legacyId =
          "r" +
          createHash("sha256")
            .update("phone:" + receiver.phone)
            .digest("hex")
            .slice(0, 32);
        await pool.query(
          "UPDATE banking.recipients SET id=$3 WHERE user_id=$1 AND id=$2",
          [sender.id, resolved.data.id, legacyId],
        );
        internalRecipient = (
          await request(sender, "/api/recipients/resolve", {
            phone: receiver.phone,
            bankId: "cardo",
          })
        ).data;
        assert.equal(internalRecipient.id, legacyId);
        assert.equal((await request(sender, "/api/contacts")).data.length, 1);
      },
    );
    await t.test(
      "Cardo card lookups shorten the same name and missing clients use a common error",
      async () => {
        const byCard = await request(sender, "/api/recipients/resolve", {
          cardNumber: receiverNumber,
        });
        assert.equal(byCard.status, 200);
        assert.equal(byCard.data.name, "Мария В.");
        assert.equal(
          byCard.data.lookupValue,
          receiverNumber.replace(/\D/g, ""),
        );
        for (const body of [
          { phone: "+79997771099" },
          { cardNumber: "1111222233334444" },
        ]) {
          const missing = await request(
            sender,
            "/api/recipients/resolve",
            body,
          );
          assert.equal(missing.status, 404);
          assert.equal(missing.data.error.code, "RECIPIENT_NOT_FOUND");
          assert.equal(missing.data.error.message, "Получатель не найден");
        }
      },
    );
    await t.test(
      "fictional examples show short names and unknown external lookups save nothing",
      async () => {
        assert.deepEqual(
          (await request(sender, "/api/recipients/examples")).data,
          [],
        );
        assert.deepEqual(
          (await request(sender, "/api/recipients/examples?bankId=cardo")).data,
          [],
        );
        assert.equal(
          (await request(sender, "/api/recipients/examples?bankId=unknown"))
            .status,
          422,
        );
        for (const bank of banks.filter((bank) => bank.id !== "cardo")) {
          const examples = (
            await request(sender, "/api/recipients/examples?bankId=" + bank.id)
          ).data;
          assert.equal(examples.length, 2);
          assert.ok(
            examples.every(
              (example) =>
                example.bankId === bank.id &&
                /^[^ ]+ \p{L}\.$/u.test(example.name),
            ),
          );
        }
        const before = (await request(sender, "/api/contacts")).data;
        const callsBefore = customerCalls;
        for (const body of [
          { bankId: "tbank", phone: "+79997771099" },
          { bankId: "vtb", phone: receiver.phone },
          { bankId: "wise", cardNumber: receiverNumber },
        ]) {
          const missing = await request(
            sender,
            "/api/recipients/resolve",
            body,
          );
          assert.equal(missing.status, 404);
          assert.equal(missing.data.error.code, "RECIPIENT_NOT_FOUND");
        }
        assert.equal(customerCalls, callsBefore);
        assert.deepEqual((await request(sender, "/api/contacts")).data, before);
      },
    );
    await t.test(
      "known fictional contacts are bank-specific without Customer lookup",
      async () => {
        const callsBefore = customerCalls;
        customerUnavailable = true;
        try {
          tbankRecipient = (
            await request(sender, "/api/recipients/resolve", {
              bankId: "tbank",
              phone: receiver.phone,
            })
          ).data;
          vtbRecipient = (
            await request(sender, "/api/recipients/resolve", {
              bankId: "vtb",
              phone: externalRecipients[2].phone,
            })
          ).data;
          assert.equal(tbankRecipient.kind, "external");
          assert.equal(tbankRecipient.currency, "RUB");
          assert.equal(tbankRecipient.targetUserId, null);
          assert.equal(tbankRecipient.bankName, "Т-Банк");
          assert.equal(tbankRecipient.name, "Анна И.");
          assert.equal(vtbRecipient.name, "Дмитрий В.");
          assert.equal(
            new Set([tbankRecipient.id, vtbRecipient.id, internalRecipient.id])
              .size,
            3,
          );
          assert.deepEqual(
            (
              await request(sender, "/api/recipients/resolve", {
                bankId: "tbank",
                phone: "8 (999) 000-20-01",
              })
            ).data,
            tbankRecipient,
          );
          assert.equal(customerCalls, callsBefore);
          const contacts = (await request(sender, "/api/contacts")).data;
          assert.equal(contacts.length, 4);
          assert.deepEqual(
            new Set(contacts.map((contact) => contact.bankId)),
            new Set(["cardo", "tbank", "vtb"]),
          );
          assert.deepEqual((await request(receiver, "/api/contacts")).data, []);
          const saved = (
            await pool.query(
              "SELECT target_user_id,target_account_id,target_card_id FROM banking.recipients WHERE user_id=$1 AND id=$2",
              [sender.id, tbankRecipient.id],
            )
          ).rows[0];
          assert.deepEqual(saved, {
            target_user_id: null,
            target_account_id: null,
            target_card_id: null,
          });
          await assert.rejects(
            pool.query(
              "UPDATE banking.recipients SET target_user_id=$3 WHERE user_id=$1 AND id=$2",
              [sender.id, tbankRecipient.id, receiver.id],
            ),
            (error) => error.code === "23514",
          );
        } finally {
          customerUnavailable = false;
        }
      },
    );
    await t.test(
      "concurrent external retries debit once, trust the saved bank and never credit Cardo",
      async () => {
        const key = randomUUID();
        const before = await balance(sender);
        const receiverBefore = await balance(receiver);
        const callsBefore = customerCalls;
        customerUnavailable = true;
        try {
          const replies = await Promise.all(
            Array.from({ length: 6 }, () =>
              send(tbankRecipient, "10.25", key, senderCards[0], {
                bankId: "cardo",
              }),
            ),
          );
          assert.ok(
            replies.every((reply) => reply.status === 200),
            JSON.stringify(replies),
          );
          const receipt = replies[0].data;
          for (const reply of replies) assert.deepEqual(reply.data, receipt);
          assert.equal(receipt.bankId, "tbank");
          assert.equal(receipt.transferKind, "external");
          assert.equal(Object.hasOwn(receipt, "receiverOperationId"), false);
          assert.equal(receipt.fee, "500.00");
          assert.equal(receipt.totalDebit, "510.25");
          assert.equal(await balance(sender), before - 51025n);
          assert.equal(await balance(receiver), receiverBefore);
          assert.equal(customerCalls, callsBefore);
          const operation = (
            await request(
              sender,
              "/api/transactions/" + receipt.senderOperationId,
            )
          ).data;
          assert.equal(operation.amountMinor, "-1025");
          assert.equal(operation.feeMinor, "50000");
          assert.equal(operation.totalDebitMinor, "51025");
          assert.equal(operation.bankId, "tbank");
          assert.equal(operation.bankName, "Т-Банк");
          assert.equal(operation.recipientReference, "+7 ••• •••-2001");
          assert.equal(operation.transferKind, "external");
          assert.equal(operation.counterpartyUserId, null);
          const rows = (
            await pool.query(
              "SELECT payload FROM banking.outbox WHERE user_id=$1 AND payload->>'type'='banking.external-transfer.completed'",
              [sender.id],
            )
          ).rows;
          assert.equal(rows.length, 1);
          assert.deepEqual(rows[0].payload.payload, {
            operationId: receipt.senderOperationId,
            amount: "10.25",
            currency: "RUB",
            bankId: "tbank",
            bankName: "Т-Банк",
            recipientReference: "+7 ••• •••-2001",
          });
          assert.deepEqual(
            (await send(tbankRecipient, "10.25", key)).data,
            receipt,
          );
          assert.equal(
            (await send(tbankRecipient, "10.26", key)).data.error.code,
            "IDEMPOTENCY_CONFLICT",
          );
          assert.equal(
            (await send(vtbRecipient, "10.25", key)).data.error.code,
            "IDEMPOTENCY_CONFLICT",
          );
          assert.equal(await balance(sender), before - 51025n);
          assert.equal(
            (
              await request(
                receiver,
                "/api/transactions/" + receipt.senderOperationId,
              )
            ).status,
            404,
          );
        } finally {
          customerUnavailable = false;
        }
      },
    );
    await t.test(
      "external card lookup never credits a Cardo account with matching card digits",
      async () => {
        const example = externalRecipients[1];
        await pool.query(
          "UPDATE banking.cards SET number=$3 WHERE user_id=$1 AND id=$2",
          [receiver.id, receiverCards[0].id, example.cardNumber],
        );
        await request(
          receiver,
          "/api/cards/" + receiverCards[0].id + "/freeze",
          { frozen: true },
        );
        try {
          const callsBefore = customerCalls;
          const externalCard = (
            await request(sender, "/api/recipients/resolve", {
              bankId: example.bankId,
              cardNumber: example.cardNumber,
            })
          ).data;
          assert.equal(externalCard.targetUserId, null);
          assert.equal(externalCard.name, "Максим С.");
          assert.equal(externalCard.lookupType, "card");
          assert.equal(externalCard.lookupValue, example.cardNumber);
          const reply = await send(externalCard, "1.50");
          assert.equal(reply.status, 200);
          assert.equal(await balance(receiver), 0n);
          assert.equal(customerCalls, callsBefore);
          const operation = (
            await request(
              sender,
              "/api/transactions/" + reply.data.senderOperationId,
            )
          ).data;
          assert.equal(
            operation.recipientReference,
            "•••• " + example.cardNumber.slice(-4),
          );
          assert.equal(operation.bankId, example.bankId);
          assert.equal(operation.name, example.name);
        } finally {
          await request(
            receiver,
            "/api/cards/" + receiverCards[0].id + "/freeze",
            { frozen: false },
          );
          await pool.query(
            "UPDATE banking.cards SET number=$3 WHERE user_id=$1 AND id=$2",
            [receiver.id, receiverCards[0].id, receiverNumber],
          );
        }
      },
    );
    await t.test(
      "old arbitrary external contacts remain stored but are hidden and cannot transfer",
      async () => {
        const id = "rlegacy-" + randomUUID();
        await pool.query(
          "INSERT INTO banking.recipients(user_id,id,name,account,initial,tone,kind,lookup_type,lookup_value,bank_id) VALUES($1,$2,'Получатель · Т-Банк','+79997771099','Т','dark','external','phone','+79997771099','tbank')",
          [sender.id, id],
        );
        const savedBefore = (
          await pool.query(
            "SELECT * FROM banking.recipients WHERE user_id=$1 AND id=$2",
            [sender.id, id],
          )
        ).rows[0];
        const before = await cards(sender);
        const beforeHistory = await history(sender);
        assert.equal(
          (await request(sender, "/api/contacts")).data.some(
            (recipient) => recipient.id === id,
          ),
          false,
        );
        const reply = await send({ id }, "1.25");
        assert.equal(reply.status, 404);
        assert.equal(reply.data.error.code, "RECIPIENT_NOT_FOUND");
        assert.deepEqual(await cards(sender), before);
        assert.deepEqual(await history(sender), beforeHistory);
        assert.deepEqual(
          (
            await pool.query(
              "SELECT * FROM banking.recipients WHERE user_id=$1 AND id=$2",
              [sender.id, id],
            )
          ).rows[0],
          savedBefore,
        );
      },
    );
    await t.test(
      "Cardo transfers retain real credits and both linked history entries",
      async () => {
        const senderBefore = await balance(sender);
        const reply = await send(internalRecipient, "3.00");
        assert.equal(reply.status, 200);
        assert.equal(reply.data.transferKind, "internal");
        assert.equal(reply.data.bankId, "cardo");
        assert.equal(await balance(sender), senderBefore - 50300n);
        assert.equal(await balance(receiver), 300n);
        for (const [user, operationId] of [
          [sender, reply.data.senderOperationId],
          [receiver, reply.data.receiverOperationId],
        ]) {
          const operation = (
            await request(user, "/api/transactions/" + operationId)
          ).data;
          assert.equal(operation.bankId, "cardo");
          assert.equal(operation.bankName, "Cardo");
          assert.equal(operation.transferKind, "internal");
          assert.equal(operation.transferId, reply.data.transferId);
          assert.match(
            operation.recipientReference,
            /^(\+7 ••• •••-|•••• )\d{4}$/,
          );
        }
      },
    );
    await t.test(
      "frozen sender, invalid amount, missing card, currency and insufficient funds preserve balances",
      async () => {
        const before = await cards(sender);
        const beforeHistory = await history(sender);
        await request(sender, "/api/cards/" + senderCards[0].id + "/freeze", {
          frozen: true,
        });
        assert.equal(
          (await send(tbankRecipient, "1")).data.error.code,
          "CARD_FROZEN",
        );
        await request(sender, "/api/cards/" + senderCards[0].id + "/freeze", {
          frozen: false,
        });
        for (const amount of ["0", "-1", "1.001"])
          assert.equal((await send(tbankRecipient, amount)).status, 422);
        assert.equal(
          (await send(tbankRecipient, "1", randomUUID(), { id: "missing" }))
            .data.error.code,
          "CARD_NOT_FOUND",
        );
        assert.equal(
          (await send(tbankRecipient, "1", randomUUID(), senderCards[1])).data
            .error.code,
          "UNSUPPORTED_TRANSFER_CURRENCY",
        );
        assert.equal(
          (await send(tbankRecipient, "999999")).data.error.code,
          "INSUFFICIENT_FUNDS",
        );
        assert.deepEqual(await cards(sender), before);
        assert.deepEqual(await history(sender), beforeHistory);
      },
    );
    await t.test(
      "internal and external operations share single and daily transfer limits",
      async () => {
        const before = await cards(sender);
        await pool.query(
          "UPDATE banking.limits SET value=1 WHERE user_id=$1 AND id='single'",
          [sender.id],
        );
        assert.equal(
          (await send(tbankRecipient, "2")).data.error.code,
          "LIMIT_EXCEEDED",
        );
        await pool.query(
          "UPDATE banking.limits SET value=300000 WHERE user_id=$1 AND id='single'",
          [sender.id],
        );
        await pool.query(
          "UPDATE banking.limits SET value=1 WHERE user_id=$1 AND id='transfer'",
          [sender.id],
        );
        assert.equal(
          (await send(tbankRecipient, "1")).data.error.code,
          "LIMIT_EXCEEDED",
        );
        assert.equal(
          (await send(internalRecipient, "1")).data.error.code,
          "LIMIT_EXCEEDED",
        );
        await pool.query(
          "UPDATE banking.limits SET value=150000 WHERE user_id=$1 AND id='transfer'",
          [sender.id],
        );
        assert.deepEqual(await cards(sender), before);
      },
    );
    await t.test(
      "outbox failure rolls back external debit, history and receipt and permits retry",
      async () => {
        const before = await cards(sender);
        const beforeHistory = await history(sender);
        const key = randomUUID();
        failOutbox = true;
        try {
          assert.equal((await send(vtbRecipient, "1.25", key)).status, 500);
        } finally {
          failOutbox = false;
        }
        assert.deepEqual(await cards(sender), before);
        assert.deepEqual(await history(sender), beforeHistory);
        assert.equal(
          (
            await pool.query(
              "SELECT key FROM banking.receipts WHERE user_id=$1 AND key=$2",
              [sender.id, key],
            )
          ).rowCount,
          0,
        );
        assert.equal((await send(vtbRecipient, "1.25", key)).status, 200);
        assert.equal(
          await balance(sender),
          BigInt(before[0].balanceMinor) - 50125n,
        );
      },
    );
    await t.test(
      "two distinct concurrent external transfers cannot overdraw the sender",
      async () => {
        const before = await balance(sender);
        assert.ok(before > 650000n && before < 1300000n);
        const replies = await Promise.all([
          send(tbankRecipient, "6000"),
          send(vtbRecipient, "6000"),
        ]);
        assert.deepEqual(
          replies.map((reply) => reply.status).sort(),
          [200, 409],
        );
        assert.equal(
          replies.find((reply) => reply.status === 409).data.error.code,
          "INSUFFICIENT_FUNDS",
        );
        assert.equal(await balance(sender), before - 650000n);
        assert.equal(await balance(receiver), 300n);
        const ledgers = (
          await pool.query(
            "SELECT a.user_id,a.balance_minor,a.opening_balance_minor,coalesce(sum(t.amount_minor),0)::text total FROM banking.accounts a LEFT JOIN banking.transactions t ON t.user_id=a.user_id AND t.account_id=a.id WHERE a.user_id=ANY($1::uuid[]) GROUP BY a.user_id,a.id",
            [users.map((user) => user.id)],
          )
        ).rows;
        for (const row of ledgers)
          assert.equal(
            BigInt(row.balance_minor),
            BigInt(row.opening_balance_minor) + BigInt(row.total),
          );
      },
    );
    await t.test(
      "all external banks resolve their examples by phone and card and reject another bank",
      async () => {
        assert.equal((await request(sender, "/api/top-ups", { cardId: senderCards[0].id, amount: "10000" }, randomUUID())).status, 200);
        const callsBefore = customerCalls;
        for (const example of externalRecipients) {
          const otherBank = banks.find(
            (bank) => bank.id !== "cardo" && bank.id !== example.bankId,
          );
          const ids = new Set();
          for (const [field, value] of [
            ["phone", example.phone],
            ["cardNumber", example.cardNumber],
          ]) {
            const found = await request(sender, "/api/recipients/resolve", {
              bankId: example.bankId,
              [field]: value,
            });
            assert.equal(found.status, 200);
            assert.equal(found.data.bankId, example.bankId);
            assert.equal(found.data.name, shortRecipientName(example.name));
            assert.equal(found.data.lookupValue, value);
            assert.equal(found.data.targetUserId, null);
            assert.equal(found.data.kind, "external");
            ids.add(found.data.id);
            const wrongBank = await request(sender, "/api/recipients/resolve", {
              bankId: otherBank.id,
              [field]: value,
            });
            assert.equal(wrongBank.status, 404);
            assert.equal(wrongBank.data.error.code, "RECIPIENT_NOT_FOUND");
          }
          assert.equal(ids.size, 2);
        }
        assert.equal(customerCalls, callsBefore);
        for (const bank of banks.slice(6)) {
          const example = externalRecipients.find(
            (recipient) => recipient.bankId === bank.id,
          );
          const recipient = (
            await request(sender, "/api/recipients/resolve", {
              bankId: bank.id,
              phone: example.phone,
            })
          ).data;
          const before = await balance(sender);
          const receiverBefore = await balance(receiver);
          const key = randomUUID();
          const sent = await send(recipient, "0.01", key);
          assert.equal(sent.status, 200);
          assert.equal(sent.data.bankId, bank.id);
          assert.equal(sent.data.bankName, bank.name);
          assert.equal(sent.data.transferKind, "external");
          assert.equal(sent.data.feeMinor, "50000");
          assert.equal(await balance(sender), before - 50001n);
          assert.equal(await balance(receiver), receiverBefore);
          assert.deepEqual(
            (await send(recipient, "0.01", key)).data,
            sent.data,
          );
          assert.equal(await balance(sender), before - 50001n);
          const operation = (
            await request(
              sender,
              "/api/transactions/" + sent.data.senderOperationId,
            )
          ).data;
          assert.equal(operation.bankId, bank.id);
          assert.equal(operation.name, example.name);
          assert.equal(operation.amountMinor, "-1");
        }
      },
    );
    await t.test("Plus also charges 100 RUB for saved external transfers and replay retains the tariff", async () => {
      premium = true;
      const before = await balance(sender);
      const receiverBefore = await balance(receiver);
      const key = randomUUID();
      const sent = await send(tbankRecipient, "1.25", key);
      assert.equal(sent.status, 200);
      assert.equal(sent.data.plan, "plus");
      assert.equal(sent.data.fee, "100.00");
      assert.equal(sent.data.totalDebit, "101.25");
      assert.equal(await balance(sender), before - 10125n);
      assert.equal(await balance(receiver), receiverBefore);
      premium = false;
      assert.deepEqual((await send(tbankRecipient, "1.25", key)).data, sent.data);
      assert.equal(await balance(sender), before - 10125n);
      const operation = (await request(sender, "/api/transactions/" + sent.data.senderOperationId)).data;
      assert.equal(operation.amountMinor, "-125");
      assert.equal(operation.feeMinor, "10000");
      const fee = (await request(sender, "/api/transactions/" + sent.data.feeOperationId)).data;
      assert.equal(fee.amountMinor, "-10000");
      assert.equal(fee.cat, "c.fee");
    });
  },
);
