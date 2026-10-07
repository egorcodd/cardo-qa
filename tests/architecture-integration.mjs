import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomInt } from "node:crypto";
import path from "node:path";
import pg from "pg";
import express from "express";
import { createBankingApp } from "../services/banking/src/app.ts";
import { createRatesClient } from "../services/banking/src/integrations/rates.ts";
import { createRatesApp } from "../services/rates/src/app.ts";
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
  const rateService = await listen(createRatesApp(rates));
  let lastTrace = "";
  rateService.server.on("request", (req) => {
    if (req.url.startsWith("/internal/quotes"))
      lastTrace = req.headers["x-request-id"];
  });
  const bankService = await listen(
    createBankingApp(banking, createRatesClient(rateService.url)),
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
  const before = await request(gateway.url, "/cards", token);
  await t.test(
    "Rates owns quotation data and receives trace context",
    async () => {
      const direct = await fetch(rateService.url + "/api/rates");
      assert.equal(direct.status, 403);
      const published = await request(gateway.url, "/rates", token);
      assert.equal(published.status, 200);
      assert.equal(published.data.version, "fixture-v1");
      assert.equal(published.data.rates.USD, 92.5);
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
  assert.equal(first.data.received, "1.00");
  assert.equal(first.data.rateVersion, "fixture-v1");
  assert.equal(lastTrace, first.headers.get("x-request-id"));
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
      const qa = pool("qa");
      try {
        assert.equal(
          (await qa.query("SELECT id FROM rates.snapshots")).rows[0].id,
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
        createBankingApp(banking, createRatesClient(bad.url)),
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
