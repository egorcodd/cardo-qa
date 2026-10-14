import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { service, errors, route, fail } from "../packages/shared/http.ts";
import { registry } from "../packages/shared/metrics.ts";
import { safeLog } from "../packages/shared/telemetry.ts";

test("polling stays in metrics but user actions and errors are the only HTTP logs", async () => {
  const app = service("banking");
  for (const path of ["/api/cards", "/api/contacts", "/api/transactions", "/api/notifications", "/api/membership"])
    app.get(path, (_req, res) => res.json([]));
  app.post("/internal/session", (_req, res) => res.json({ ok: true }));
  app.post("/api/top-ups", (_req, res) => res.json({ ok: true }));
  app.get("/api/cards/:id/requisites", route(async () => fail(500, "INTERNAL_ERROR", "Unavailable")));
  errors(app);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = "http://127.0.0.1:" + server.address().port;
  const output = [];
  const oldLog = console.log, oldError = console.error;
  console.log = console.error = line => output.push(JSON.parse(line));
  try {
    for (let cycle = 0; cycle < 3; cycle++)
      for (const path of ["/api/cards", "/api/contacts", "/api/transactions", "/api/notifications", "/api/membership"])
        await fetch(base + path);
    await fetch(base + "/internal/session", { method: "POST" });
    await fetch(base + "/api/top-ups", { method: "POST", headers: { "X-Request-Id": "user-action" } });
    await fetch(base + "/api/cards/private-card-id/requisites");
    await fetch(base + "/api/not-existing?email=private@example.test");
    assert.equal(output.filter(row => row.message === "http.request" && row.status < 400 && row.route !== "/api/top-ups").length, 0,
      "successful background reads and session validation must not fill Kibana");
    assert.equal(output.filter(row => row.route === "/api/top-ups").length, 1);
    assert.ok(output.some(row => row.status === 500 && row.route === "/api/cards/:id/requisites"));
    assert.ok(output.some(row => row.status === 404));
    assert.ok(!JSON.stringify(output).includes("private@example.test"));
    const metrics = await registry.metrics();
    assert.match(metrics, /cardo_http_requests_total\{service="banking",method="GET",route="\/api\/cards",status="200"\} 3/);
  } finally {
    console.log = oldLog; console.error = oldError;
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});

test("Gateway routes use OpenAPI templates and never place path values in labels", async () => {
  const { publicRouteResolver } = await import("../packages/shared/metrics.ts");
  const { default: openapi } = await import("../services/gateway/openapi.ts");
  const resolve = publicRouteResolver(Object.keys(openapi.paths).map(path => "/api" + path));
  assert.equal(resolve("/api/top-ups"), "/api/top-ups");
  assert.equal(resolve("/api/transactions/private-email@example.test?token=secret"), "/api/transactions/:id");
  assert.equal(resolve("/api/cards/private-card/requisites"), "/api/cards/:id/requisites");
  assert.equal(resolve("/api/unknown/private-phone"), "/api/unknown");
  assert.equal(resolve("/assets/private-file.js"), "/assets/:file");
});

test("collector rejects legacy polling logs but retains failures and business events", () => {
  const base = { service: "gateway", level: "info", message: "http.request", method: "GET", route: "/unmatched", status: 200 };
  assert.equal(safeLog(base), null);
  assert.ok(safeLog({ ...base, route: "/api/transfer", method: "POST" }));
  assert.ok(safeLog({ ...base, status: 500 }));
  assert.ok(safeLog({ service: "engagement", level: "error", message: "event.dead_letter", eventId: "event-1" }));
});
