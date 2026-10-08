import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomInt } from "node:crypto";
import path from "node:path";
import pg from "pg";
import express from "express";
import { createBankingApp } from "../services/banking/src/app.ts";
import { createRatesClient } from "../services/banking/src/integrations/rates.ts";
import { createCustomerClient } from "../services/banking/src/integrations/customer.ts";
import { createMembershipClient } from "../services/banking/src/integrations/membership.ts";
import { createRatesApp } from "../services/rates/src/app.ts";
import { currentSnapshot } from "../services/rates/src/snapshots.ts";
import { createGatewayApp } from "../services/gateway/src/app.ts";
const defaults = {
  customer: process.env.CUSTOMER_URL || "http://127.0.0.1:8081",
  banking: process.env.BANKING_URL || "http://127.0.0.1:8082",
  engagement: process.env.ENGAGEMENT_URL || "http://127.0.0.1:8083",
  rates: process.env.RATES_URL || "http://127.0.0.1:8084",
};
const internal = process.env.INTERNAL_TOKEN || "cardo-local-internal";
const pool = (owner) =>
  new pg.Pool({
    connectionString:
      process.env["TEST_" + owner.toUpperCase() + "_DATABASE_URL"] ||
      `postgres://cardo_${owner}:cardo_${owner}_dev@127.0.0.1:5434/cardo`,
  });
async function listen(app) {
  const server = await new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => resolve(server));
  });
  return { server, url: "http://127.0.0.1:" + server.address().port };
}
const close = (server) =>
  new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
    server.closeIdleConnections();
  });
async function request(base, route, token, body, extra = {}) {
  const response = await fetch(base + "/api" + route, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: "Bearer " + token } : {}),
      ...extra,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return {
    status: response.status,
    data: await response.json(),
    headers: response.headers,
  };
}
test("Real service boundaries, dependency failure and exchange replay", async (t) => {
  const banking = pool("banking"),
    rates = pool("rates");
  let activeSnapshot = await currentSnapshot(rates);
  const rateService = await listen(createRatesApp(rates, async () => activeSnapshot));
  let lastTrace = "";
  rateService.server.on("request", (req) => {
    if (req.url.startsWith("/internal/quotes"))
      lastTrace = req.headers["x-request-id"];
  });
  const bankService = await listen(
    createBankingApp(banking, createRatesClient(rateService.url), createCustomerClient(defaults.customer), createMembershipClient(defaults.engagement)),
  );
  const gateway = await listen(
    createGatewayApp(
      { ...defaults, banking: bankService.url, rates: rateService.url },
      path.resolve(import.meta.dirname, "../dist"),
    ),
  );
  let ratesClosed = false;
  t.after(async () => {
    await close(gateway.server);
    await close(bankService.server);
    if (!ratesClosed) await close(rateService.server);
    await banking.end();
    await rates.end();
  });
  const registration = await request(gateway.url, "/auth/register", undefined, {
    phone: "+79" + randomInt(100000000, 999999999),
    name: "Проверка сервисов",
    password: "Cardo12345",
  });
  assert.equal(registration.status, 201);
  const token = registration.data.token;
  assert.equal(
    (
      await request(
        gateway.url,
        "/top-ups",
        token,
        { cardId: "k1", amount: "5000" },
        { "Idempotency-Key": randomUUID() },
      )
    ).status,
    200,
  );
  const receiver = await request(gateway.url, "/auth/register", undefined, {
    phone: "+79" + randomInt(100000000, 999999999),
    name: "Получатель",
    password: "Cardo12345",
  });
  assert.equal(receiver.status, 201);
  await request(gateway.url, "/recipients/resolve", token, {
    phone: receiver.data.user.phone,
  });
  const before = await request(gateway.url, "/cards", token);
  let publishedRates;
  await t.test(
    "Rates owns quotation data and receives trace context",
    async () => {
      const direct = await fetch(rateService.url + "/api/rates");
      assert.equal(direct.status, 403);
      const published = await request(gateway.url, "/rates", token);
      assert.equal(published.status, 200);
      assert.match(published.data.version, /^cbr-\d{4}-\d{2}-\d{2}-[0-9a-f]{16}$/);
      assert.equal(published.data.source, "cbr");
      assert.match(published.data.asOf, /^\d{4}-\d{2}-\d{2}$/);
      assert.ok(published.data.rates.USD > 0 && published.data.rates.EUR > 0);
      publishedRates = published.data;
      const invalid = await fetch(
        rateService.url + "/internal/quotes?from=RUB&to=KZT",
        { headers: { "X-Internal-Token": internal } },
      );
      assert.equal(invalid.status, 422);
    },
  );
  const key = "ex-" + randomUUID(),
    body = { from: "RUB", to: "USD", amount: "92.50" };
  const first = await request(gateway.url, "/exchange", token, body, {
    "Idempotency-Key": key,
    "X-Request-Id": "rates-boundary-" + randomUUID(),
  });
  assert.equal(first.status, 200);
  const numerator = 9250n * 10000n;
  const denominator = BigInt(Math.round(publishedRates.rates.USD * 10000));
  const expectedMinor = (numerator + denominator / 2n) / denominator;
  assert.equal(first.data.received, `${expectedMinor / 100n}.${String(expectedMinor % 100n).padStart(2, "0")}`);
  assert.equal(first.data.rateVersion, publishedRates.version);
  assert.equal(lastTrace, first.headers.get("x-request-id"));
  await t.test(
    "A changed source quote cannot modify a saved exchange or debit on replay",
    async () => {
      const balances = (await request(gateway.url, "/cards", token)).data;
      activeSnapshot = {
        ...activeSnapshot,
        version: activeSnapshot.version + "-changed",
        units: { ...activeSnapshot.units, USD: String(BigInt(activeSnapshot.units.USD) + 100000n) },
      };
      const changed = await fetch(rateService.url + "/internal/quotes?from=RUB&to=USD", {
        headers: { "X-Internal-Token": internal },
      });
      assert.equal(changed.status, 200);
      const quote = await changed.json();
      assert.notEqual(quote.version, first.data.rateVersion);
      assert.notEqual(quote.denominator, denominator.toString());
      const replay = await request(gateway.url, "/exchange", token, body, {
        "Idempotency-Key": key,
      });
      assert.equal(replay.status, 200);
      assert.deepEqual(replay.data, first.data);
      assert.deepEqual((await request(gateway.url, "/cards", token)).data, balances);
      const fresh = await request(gateway.url, "/exchange", token, body, {
        "Idempotency-Key": "ex-" + randomUUID(),
      });
      assert.equal(fresh.status, 200);
      assert.equal(fresh.data.rateVersion, quote.version);
      assert.notEqual(fresh.data.received, first.data.received);
    },
  );
  await close(rateService.server);
  ratesClosed = true;
  await t.test(
    "Rates failure prevents new exchanges without changing balances",
    async () => {
      const balances = (await request(gateway.url, "/cards", token)).data;
      const failed = await request(gateway.url, "/exchange", token, body, {
        "Idempotency-Key": "ex-" + randomUUID(),
      });
      assert.equal(failed.status, 503);
      assert.equal(failed.data.error.code, "RATES_UNAVAILABLE");
      assert.deepEqual(
        (await request(gateway.url, "/cards", token)).data,
        balances,
      );
      const saved = await request(gateway.url, "/exchange", token, body, {
        "Idempotency-Key": key,
      });
      assert.equal(saved.status, 200);
      assert.deepEqual(saved.data, first.data);
      const conflict = await request(
        gateway.url,
        "/exchange",
        token,
        { ...body, amount: "100" },
        { "Idempotency-Key": key },
      );
      assert.equal(conflict.status, 409);
    },
  );
  await t.test(
    "Transfers and profile remain available while Rates is down",
    async () => {
      assert.equal((await request(gateway.url, "/profile", token)).status, 200);
      const contacts = (await request(gateway.url, "/contacts", token)).data;
      const senderBefore = (await request(gateway.url, "/cards", token)).data[0];
      const receiverBefore = (await request(gateway.url, "/cards", receiver.data.token)).data[0];
      const transfer = await request(
        gateway.url,
        "/transfer",
        token,
        {
          cardId: before.data[0].id,
          recipientId: contacts[0].id,
          amount: "1.00",
        },
        { "Idempotency-Key": randomUUID() },
      );
      assert.equal(transfer.status, 200);
      assert.equal(transfer.data.plan, "standard");
      assert.equal(transfer.data.fee, "500.00");
      assert.equal(transfer.data.totalDebit, "501.00");
      assert.equal(BigInt((await request(gateway.url, "/cards", token)).data[0].balanceMinor), BigInt(senderBefore.balanceMinor) - 50100n);
      assert.equal(BigInt((await request(gateway.url, "/cards", receiver.data.token)).data[0].balanceMinor), BigInt(receiverBefore.balanceMinor) + 100n);
      const health = await fetch(gateway.url + "/health");
      assert.equal(health.status, 503);
      const state = await health.json();
      assert.equal(state.services.find((s) => s.name === "rates").ok, false);
      assert.equal(state.services.find((s) => s.name === "banking").ok, true);
    },
  );
  await t.test(
    "Database roles cannot query a different service schema",
    async () => {
      await assert.rejects(
        rates.query("SELECT * FROM banking.accounts LIMIT 1"),
        (error) => error.code === "42501",
      );
      await assert.rejects(
        banking.query("SELECT * FROM rates.snapshots LIMIT 1"),
        (error) => error.code === "42501",
      );
      await assert.rejects(
        banking.query("SELECT * FROM engagement.memberships LIMIT 1"),
        (error) => error.code === "42501",
      );
      const qa = pool("qa");
      try {
        assert.equal(
          (await qa.query("SELECT id FROM rates.snapshots WHERE id='fixture-v1'")).rows[0].id,
          "fixture-v1",
        );
        await assert.rejects(
          qa.query("UPDATE rates.snapshots SET source=source"),
          (error) => error.code === "42501",
        );
      } finally {
        await qa.end();
      }
    },
  );
  await t.test(
    "Invalid quote from a reachable upstream cannot cause debit",
    async () => {
      const fault = express();
      fault.get("/internal/quotes", (_req, res) =>
        res.json({
          version: "bad",
          from: "RUB",
          to: "USD",
          numerator: "10000",
          denominator: "0",
        }),
      );
      const bad = await listen(fault);
      const isolated = await listen(
        createBankingApp(banking, createRatesClient(bad.url), createCustomerClient(defaults.customer), createMembershipClient(defaults.engagement)),
      );
      try {
        const response = await fetch(isolated.url + "/api/exchange", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Internal-Token": internal,
            "X-User-Id": registration.data.user.id,
            "Idempotency-Key": "ex-" + randomUUID(),
          },
          body: JSON.stringify(body),
        });
        assert.equal(response.status, 503);
      } finally {
        await close(isolated.server);
        await close(bad.server);
      }
    },
  );
});
