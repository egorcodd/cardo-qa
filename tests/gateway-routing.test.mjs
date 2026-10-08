import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import http from "node:http";
import { randomUUID } from "node:crypto";
import { createGatewayApp } from "../services/gateway/src/app.ts";
test("Gateway preserves public routes and cannot proxy to internal endpoints", async (t) => {
  const servers = [];
  async function listen(app) {
    const server = await new Promise((resolve) => {
      const server = app.listen(0, "127.0.0.1", () => resolve(server));
    });
    servers.push(server);
    return "http://127.0.0.1:" + server.address().port;
  }
  t.after(async () => {
    for (const server of servers)
      await new Promise((resolve) => {
        server.close(resolve);
        server.closeIdleConnections();
      });
  });
  const user = { id: randomUUID(), name: "Проверка маршрутов", language: "ru" };
  const customer = express();
  customer.use(express.json());
  customer.post("/internal/session", (_req, res) => res.json(user));
  const calls = [];
  const upstream = express();
  upstream.use(express.json());
  upstream.use((req, res) => {
    calls.push({
      path: req.originalUrl,
      method: req.method,
      userId: req.header("X-User-Id"),
      trusted: Boolean(req.header("X-Internal-Token")),
      body: req.body,
    });
    res.json({ path: req.originalUrl });
  });
  const customerUrl = await listen(customer);
  const upstreamUrl = await listen(upstream);
  const gatewayUrl = await listen(
    createGatewayApp(
      {
        customer: customerUrl,
        banking: upstreamUrl,
        engagement: upstreamUrl,
        rates: upstreamUrl,
      },
      new URL("../dist", import.meta.url).pathname,
    ),
  );
  async function request(path, method = "GET", body) {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    return new Promise((resolve, reject) => {
      const req = http.request(
        gatewayUrl,
        {
          path,
          method,
          headers: {
            Authorization: "Bearer " + "a".repeat(64),
            "Content-Type": "application/json",
            "X-User-Id": randomUUID(),
            "X-Internal-Token": "untrusted-client-value",
            ...(payload === undefined
              ? {}
              : { "Content-Length": Buffer.byteLength(payload) }),
          },
        },
        (res) => {
          let text = "";
          res.on("data", (data) => {
            text += data;
          });
          res.on("end", () =>
            resolve({ status: res.statusCode, data: JSON.parse(text) }),
          );
        },
      );
      req.on("error", reject);
      req.end(payload);
    });
  }
  await t.test(
    "raw and encoded traversal never reaches an upstream",
    async () => {
      for (const path of [
        "/api/cards/../../internal/provision",
        "/api/cards/%2e%2e/%2e%2e/internal/provision",
        "/api/cards/%2E./.%2e/internal/provision",
        "/api/cards/../top-ups",
        "/api/cards/..\\..\\internal\\provision",
        "/api/cards/%5c..%5c..%5cinternal%5cprovision",
        "/api/cards/%2f..%2f..%2finternal%2fprovision",
        "/api/cards/%252e%252e/%252e%252e/internal/provision",
        "/api/cards/%255c..%255c..%255cinternal%255cprovision",
        "/api/cards/%ZZ/internal/provision",
        "/api/cards\u0009/../../internal/provision",
        "/api/cards#fragment",
      ]) {
        const count = calls.length;
        let response;
        try {
          response = await request(path, "POST", {
            userId: randomUUID(),
            name: "Проверка",
            demo: true,
          });
        } catch (error) {
          if (error.code === "ERR_UNESCAPED_CHARACTERS") {
            assert.equal(calls.length, count);
            continue;
          }
          throw error;
        }
        assert.equal(response.status, 404, path);
        assert.equal(calls.length, count, path);
      }
    },
  );
  await t.test(
    "own public APIs retain their method, identity and encoded query",
    async () => {
      for (const path of [
        "/api/banks",
        "/api/recipients/examples?bankId=tbank",
        "/api/cards",
        "/api/transactions/n" + randomUUID(),
        "/api/transactions?limit=25&currency=RUB&note=%D0%BF%D1%80%D0%BE%D0%B1%D0%B0%20%26%20%23%2F%5C%2e%2e",
        "/api/reminders?filter=a%2Bb%26c%3Dd",
      ]) {
        const response = await request(path);
        assert.equal(response.status, 200);
        assert.equal(response.data.path, path);
        const call = calls.at(-1);
        assert.equal(call.userId, user.id);
        assert.equal(call.trusted, true);
        assert.equal(call.method, "GET");
      }
      for (const method of ["PUT", "DELETE"]) {
        const path = "/api/banks/sber/favorite";
        const response = await request(path, method, { userId: randomUUID() });
        assert.equal(response.status, 200);
        assert.equal(response.data.path, path);
        assert.equal(calls.at(-1).path, path);
        assert.equal(calls.at(-1).method, method);
        assert.equal(calls.at(-1).userId, user.id);
        assert.equal(calls.at(-1).trusted, true);
      }
      const payload = { cardId: "k1", amount: "123.45" };
      assert.equal(
        (await request("/api/top-ups", "POST", payload)).status,
        200,
      );
      assert.deepEqual(calls.at(-1).body, payload);
      assert.equal(calls.at(-1).path, "/api/top-ups");
    },
  );
  await t.test(
    "bank favorites require authentication and exact public routes",
    async () => {
      let count = calls.length;
      const unauthenticated = await fetch(
        gatewayUrl + "/api/banks/sber/favorite",
        { method: "PUT" },
      );
      assert.equal(unauthenticated.status, 401);
      assert.equal(calls.length, count);
      for (const [path, method] of [
        ["/api/banks/sber/favorite", "POST"],
        ["/api/banks/sber/favorite/extra", "PUT"],
        ["/api/banks", "DELETE"],
        ["/api/banks/%2e%2e/internal/provision", "POST"],
      ]) {
        count = calls.length;
        const response = await request(path, method);
        assert.equal(response.status, 404, path);
        assert.equal(calls.length, count, path);
      }
    },
  );
});
