import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createBanksRoutes } from "../services/banking/src/features/banks.ts";
import { banks } from "../services/banking/src/banks.ts";
import { service, internal, errors } from "../packages/shared/http.ts";
import openapi from "../services/gateway/openapi.ts";

test("Bank catalog exposes only ID and name; removed mutations have no contract", () => {
  assert.equal(openapi.paths["/banks/{bankId}/favorite"], undefined);
  const media = openapi.paths["/banks"].get.responses["200"].content["application/json"];
  assert.deepEqual(media.example, banks);
  assert.deepEqual(media.schema.items.required, ["id", "name"]);
  assert.equal(media.schema.items.properties.favorite, undefined);
  for (const bank of banks) assert.deepEqual(Object.keys(bank).sort(), ["id", "name"]);
});

test("Bank catalog requires trusted user context and rejects legacy favorites routes", async (t) => {
  const app = service("bank-catalog-test");
  app.use(internal);
  app.use(createBanksRoutes());
  errors(app);
  const server = await new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => resolve(server));
  });
  t.after(async () => {
    await new Promise((resolve) => {
      server.close(resolve);
      server.closeIdleConnections();
    });
  });
  const base = "http://127.0.0.1:" + server.address().port;
  const headers = { "X-Internal-Token": process.env.INTERNAL_TOKEN || "cardo-local-internal", "X-User-Id": randomUUID() };
  const response = await fetch(base + "/api/banks", { headers });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), banks);
  assert.ok(response.headers.get("X-Request-Id"));
  assert.equal((await fetch(base + "/api/banks")).status, 403);
  assert.equal((await fetch(base + "/api/banks", { headers: { ...headers, "X-User-Id": "" } })).status, 401);
  for (const method of ["GET", "PUT", "DELETE", "POST"]) {
    assert.equal((await fetch(base + "/api/banks/sber/favorite", { headers, method })).status, 404);
  }
});
