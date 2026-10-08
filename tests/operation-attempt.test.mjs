import test from "node:test";
import assert from "node:assert/strict";

const moduleUrl = new URL("../apps/web/src/operationAttempt.js", import.meta.url);
let sequence = 0;
const payload = { cardId: "card-1", recipientId: "recipient-2", amount: "1000.00" };

async function freshModule() {
  return import(moduleUrl.href + "?attempt-test=" + ++sequence);
}

async function withStorage(run) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
  const stored = new Map();
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    writable: true,
    value: {
      getItem: (key) => stored.get(key) ?? null,
      setItem: (key, value) => stored.set(key, value),
      removeItem: (key) => stored.delete(key),
    },
  });
  try {
    await run(stored);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "sessionStorage", descriptor);
    else delete globalThis.sessionStorage;
  }
}

test("an ambiguous response reuses the operation key for the same request", async () => {
  await withStorage(async () => {
    const attempts = await freshModule();
    assert.equal(attempts.savedAttempt("student-a", "transfer", payload), null);
    const key = attempts.operationKey("student-a", "transfer", payload);
    for (const error of [{ network: true }, { status: 500 }, { status: 503 }]) {
      assert.equal(attempts.uncertainError(error), true);
      assert.equal(attempts.operationKey("student-a", "transfer", payload), key);
    }
  });
});

test("operation attempts are isolated by account, action and request payload", async () => {
  await withStorage(async () => {
    const attempts = await freshModule();
    const key = attempts.operationKey("student-a", "transfer", payload);
    assert.notEqual(attempts.operationKey("student-b", "transfer", payload), key);
    assert.notEqual(attempts.operationKey("student-a", "top-up", payload), key);
    assert.notEqual(attempts.operationKey("student-a", "transfer", { ...payload, amount: "1001.00" }), key);
    assert.notEqual(attempts.operationKey("student-a", "transfer", { ...payload, recipientId: "recipient-3" }), key);
    assert.equal(attempts.operationKey("student-a", "transfer", payload), key);
  });
});

test("reloading the module restores an unresolved operation from session storage", async () => {
  await withStorage(async () => {
    const beforeReload = await freshModule();
    const key = beforeReload.operationKey("student-a", "transfer", payload);
    const afterReload = await freshModule();
    assert.equal(afterReload.savedAttempt("student-a", "transfer", payload), key);
    assert.equal(afterReload.operationKey("student-a", "transfer", payload), key);
    afterReload.clearAttempt("student-a", "transfer", payload);
    const afterCompletion = await freshModule();
    assert.equal(afterCompletion.savedAttempt("student-a", "transfer", payload), null);
    assert.notEqual(afterCompletion.operationKey("student-a", "transfer", payload), key);
  });
});

test("definitive rejections can be cleared without affecting another account", async () => {
  await withStorage(async () => {
    const attempts = await freshModule();
    const otherKey = attempts.operationKey("student-b", "transfer", payload);
    for (const status of [401, 404, 409, 422, 429]) {
      const key = attempts.operationKey("student-a", "transfer", payload);
      assert.equal(attempts.uncertainError({ status }), false);
      attempts.clearAttempt("student-a", "transfer", payload);
      assert.equal(attempts.savedAttempt("student-a", "transfer", payload), null);
      assert.notEqual(attempts.operationKey("student-a", "transfer", payload), key);
      assert.equal(attempts.savedAttempt("student-b", "transfer", payload), otherKey);
    }
    assert.equal(attempts.uncertainError(new Error("Incomplete response")), true);
  });
});

test("blocked browser storage still permits safe retries in the current page", async () => {
  await withStorage(async () => {
    globalThis.sessionStorage = {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("blocked"); },
      removeItem: () => { throw new Error("blocked"); },
    };
    const attempts = await freshModule();
    const key = attempts.operationKey("student-a", "transfer", payload);
    assert.equal(attempts.savedAttempt("student-a", "transfer", payload), key);
    assert.equal(attempts.operationKey("student-a", "transfer", payload), key);
    attempts.clearAttempt("student-a", "transfer", payload);
    assert.equal(attempts.savedAttempt("student-a", "transfer", payload), null);
    assert.notEqual(attempts.operationKey("student-a", "transfer", payload), key);
  });
});
