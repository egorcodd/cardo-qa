import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { webObfuscation } from "../apps/web/build/obfuscation.js";

async function transformedModule(file, instance = "") {
  const path = new URL("../apps/web/src/" + file, import.meta.url);
  const source = readFileSync(path, "utf8");
  const chunk = { moduleIds: [path.pathname] };
  const plugin = webObfuscation();
  const transformed = plugin.renderChunk(source, chunk);
  assert.notEqual(transformed.code, source);
  assert.equal(plugin.renderChunk(source, chunk).code, transformed.code);
  assert.doesNotMatch(transformed.code, /sourceMappingURL|\beval\s*\(/);
  return import("data:text/javascript;base64," + Buffer.from(transformed.code).toString("base64") + "#" + instance);
}

test("obfuscated API keeps URLs, JSON fields, currency and request headers", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    return { ok: true, json: async () => ({ status: "completed", currency: "EUR" }) };
  };
  try {
    const { api } = await transformedModule("api.js");
    const payload = { cardId: "k3", recipientId: "recipient-1", amount: "10.25" };
    assert.deepEqual(await api.transfer(payload, "attempt-1"), { status: "completed", currency: "EUR" });
    await api.freeze("card/1", true);
    await api.transferFee("EUR");
    assert.equal(requests[0].url, "/api/transfer");
    assert.equal(requests[0].options.method, "POST");
    assert.equal(requests[0].options.credentials, "same-origin");
    assert.equal(requests[0].options.headers["Idempotency-Key"], "attempt-1");
    assert.equal(requests[0].options.headers["Content-Type"], "application/json");
    assert.deepEqual(JSON.parse(requests[0].options.body), payload);
    assert.equal(requests[1].url, "/api/cards/card%2F1/freeze");
    assert.deepEqual(JSON.parse(requests[1].options.body), { frozen: true });
    assert.equal(requests[2].url, "/api/transfer/fee?currency=EUR");
    globalThis.fetch = async () => ({ ok: false, status: 409, json: async () => ({ error: { code: "CARD_FROZEN", message: "Card frozen" } }) });
    await assert.rejects(api.transfer(payload, "attempt-2"), (error) => error.status === 409 && error.code === "CARD_FROZEN");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("obfuscated operation attempts survive reload and remain isolated by account", async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
  const stored = new Map();
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: {
    getItem: (key) => stored.get(key) ?? null,
    setItem: (key, value) => stored.set(key, value),
    removeItem: (key) => stored.delete(key),
  } });
  try {
    const before = await transformedModule("operationAttempt.js", "before");
    const payload = { cardId: "k3", recipientId: "recipient-1", amount: "10.25" };
    const id = before.operationKey("account-a", "transfer", payload);
    const after = await transformedModule("operationAttempt.js", "after");
    assert.equal(after.savedAttempt("account-a", "transfer", payload), id);
    assert.equal(after.operationKey("account-a", "transfer", payload), id);
    assert.notEqual(after.operationKey("account-b", "transfer", payload), id);
    after.clearAttempt("account-a", "transfer", payload);
    assert.equal(after.savedAttempt("account-a", "transfer", payload), null);
    assert.equal(after.uncertainError({ status: 500 }), true);
    assert.equal(after.uncertainError({ status: 409 }), false);
  } finally {
    if (previous) Object.defineProperty(globalThis, "sessionStorage", previous);
    else delete globalThis.sessionStorage;
  }
});
