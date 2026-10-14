import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { safeLog, publicEvent } from "../packages/shared/telemetry.ts";
import { service, errors } from "../packages/shared/http.ts";

test("Cardo's installed worker leaves the shared observability pages to their own applications", async () => {
  const handlers = new Map();
  runInNewContext(readFileSync(new URL("../apps/web/public/sw.js", import.meta.url), "utf8"), {
    URL,
    self: { location: { origin: "https://cardo.example.test" }, addEventListener: (name, fn) => handlers.set(name, fn) },
    caches: { open: async () => ({ match: async () => ({ cardoShell: true }) }) },
  });
  for (const path of ["/tools", "/tools/grafana/login", "/tools/kafka/", "/tools/kibana/s/cardo/app/discover"]) {
    let intercepted = false;
    handlers.get("fetch")({ request: { method: "GET", mode: "navigate", url: "https://cardo.example.test" + path }, respondWith: () => { intercepted = true; } });
    assert.equal(intercepted, false, path);
  }
  let shell;
  handlers.get("fetch")({ request: { method: "GET", mode: "navigate", url: "https://cardo.example.test/cards" }, respondWith: promise => { shell = promise; } });
  assert.equal((await shell).cardoShell, true);
});

test("student logs use an allowlist and never carry request bodies or personal fields", () => {
  const entry = safeLog({ service: "banking", level: "error", message: "http.error", requestId: "qa-trace", errorCode: "INVALID_CARD", status: 500, name: "private-name", phone: "+79991234567", email: "private@example.test", password: "private-password", token: "private-token", cookie: "private-cookie", userId: "private-user", body: { card: "1234123412341234" }, stack: "private-stack", route: "/api/cards/1234?token=private-token" });
  assert.equal(entry.route, "/api/cards/:id");
  assert.equal(entry.status, 500);
  for (const marker of ["private-", "+79991234567", "1234123412341234"]) assert.ok(!JSON.stringify(entry).includes(marker));
  assert.equal(safeLog({ service: "banking", level: "error", message: "password=secret" }), null);
  assert.equal(safeLog({ service: "eqa", level: "info", message: "http.request" }), null);
});

test("Kafka practice events project only permitted fields", () => {
  const event = { id: "75b65963-8916-4d79-a4ae-25424797c33f", requestId: "qa-trace", userId: "48a6b9bb-cfcb-43fc-b6e0-3907f3f68782", type: "banking.transfer.completed", version: 2, occurredAt: "2026-10-14T12:00:00Z", payload: { senderName: "private-sender", receiverName: "private-recipient", senderUserId: "private-id", recipientReference: "+79991234567", senderOperationId: "tr-safe", amount: "10.00", currency: "RUB" } };
  const projection = publicEvent(event);
  assert.equal(projection.eventId, event.id);
  assert.equal(projection.requestId, event.requestId);
  assert.equal(projection.operationId, "tr-safe");
  assert.match(projection.accountRef, /^[a-f0-9]{12}$/);
  for (const marker of ["private-", event.userId, "+79991234567"]) assert.ok(!JSON.stringify(projection).includes(marker));
});

test("metrics require an internal credential and bad JSON still has a trace id", async () => {
  const app = service("banking");
  app.post("/example", (_req, res) => res.json({ ok: true }));
  errors(app);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = "http://127.0.0.1:" + server.address().port;
  try {
    assert.equal((await fetch(base + "/metrics")).status, 403);
    const bad = await fetch(base + "/example", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" });
    assert.equal(bad.status, 400);
    assert.match(bad.headers.get("X-Request-Id"), /^[0-9a-f-]{36}$/);
    const metrics = await fetch(base + "/metrics", { headers: { Authorization: "Bearer " + (process.env.INTERNAL_TOKEN || "cardo-local-internal") } });
    assert.equal(metrics.status, 200);
    const text = await metrics.text();
    assert.match(text, /cardo_http_requests_total.*status="400"/);
    assert.match(text, /cardo_http_request_duration_seconds_bucket/);
    assert.ok(!text.includes("cardo-local-internal"));
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
