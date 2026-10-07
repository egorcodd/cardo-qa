import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
const source = readFileSync(
  new URL("../apps/web/public/sw.js", import.meta.url),
  "utf8",
);
function worker(overrides = {}) {
  const handlers = new Map();
  const env = {
    URL,
    self: {
      location: { origin: "http://localhost:8942" },
      addEventListener: (name, fn) => handlers.set(name, fn),
      ...overrides.self,
    },
    fetch: overrides.fetch || (() => Promise.reject(new Error("offline"))),
    caches: overrides.caches || { match: async () => ({ shell: true }) },
  };
  runInNewContext(source, env);
  return handlers;
}
test("PWA does not cache API or modifying requests", () => {
  let intercepted = 0;
  const handlers = worker();
  for (const [method, path] of [
    ["GET", "/api/cards"],
    ["POST", "/api/transfer"],
    ["GET", "/metrics"],
  ])
    handlers.get("fetch")({
      request: { method, url: "http://localhost:8942" + path, mode: "cors" },
      respondWith: () => intercepted++,
    });
  assert.equal(intercepted, 0);
});
test("offline navigation falls back to the static shell", async () => {
  let response;
  worker().get("fetch")({
    request: {
      method: "GET",
      url: "http://localhost:8942/cards/k1",
      mode: "navigate",
    },
    respondWith: (promise) => {
      response = promise;
    },
  });
  assert.deepEqual(await response, { shell: true });
});
test("push opens only a Cardo deep link", async () => {
  for (const [url, expected] of [
    ["/history/n123", "/history/n123"],
    ["https://other.example", "/notifications"],
  ]) {
    let shown, pending;
    const handlers = worker({
      self: {
        registration: {
          showNotification: async (title, options) => {
            shown = { title, options };
          },
        },
      },
    });
    handlers.get("push")({
      data: { json: () => ({ title: "Cardo", url }) },
      waitUntil: (promise) => {
        pending = promise;
      },
    });
    await pending;
    assert.equal(shown.options.data.url, expected);
  }
});
