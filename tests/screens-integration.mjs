import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomInt } from "node:crypto";
const base = process.env.TEST_URL || "http://127.0.0.1:8942";
async function call(path, token, method = "GET", body, headers = {}) {
  const r = await fetch(base + "/api" + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: "Bearer " + token } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: r.status, data: await r.json() };
}
test("profile, preferences, currency exchange and credential rotation", async (t) => {
  const phone = "+79" + randomInt(100000000, 999999999),
    password = "Cardo12345";
  const register = await call("/auth/register", null, "POST", {
    phone,
    password,
    name: "Александр",
  });
  assert.equal(register.status, 201);
  const token = register.data.token;
  const outsider = await call("/auth/register", null, "POST", {
    phone: "+79" + randomInt(100000000, 999999999),
    password,
    name: "Анна",
  });
  assert.equal(outsider.status, 201);
  await t.test(
    "editable profile persists and rejects invalid personal fields",
    async () => {
      const values = {
        email: "alex@cardo.test",
        birth: "1998-03-14",
        avatarTone: "blue",
      };
      assert.equal(
        (await call("/profile", token, "PATCH", values)).status,
        200,
      );
      const p = (await call("/profile", token)).data;
      assert.equal(p.name, "Александр");
      for (const [k, v] of Object.entries(values)) assert.equal(p[k], v);
      assert.equal(
        (await call("/profile", token, "PATCH", { birth: "1998-02-31" }))
          .status,
        422,
      );
      assert.equal(
        (await call("/profile", token, "PATCH", { birth: "2098-01-01" }))
          .status,
        422,
      );
      assert.equal(
        (await call("/profile", token, "PATCH", { email: "invalid" })).status,
        422,
      );
      assert.equal(
        (await call("/profile", token, "PATCH", { avatarTone: "<script>" }))
          .status,
        422,
      );
      assert.equal(
        (await call("/profile", token, "PATCH", { email: "", birth: "" }))
          .status,
        200,
      );
      const other = (await call("/profile", outsider.data.token)).data;
      assert.equal(other.avatarTone, "lime");
      assert.equal(other.name, "Анна");
    },
  );
  await t.test(
    "balance visibility preferences survive reload and validation",
    async () => {
      assert.equal(
        (await call("/settings", token, "PUT", { hideBalance: true })).data
          .hideBalance,
        true,
      );
      assert.equal((await call("/profile", token)).data.hideBalance, true);
      assert.equal(
        (await call("/settings", token, "PUT", { hideBalance: "false" }))
          .status,
        422,
      );
      assert.equal(
        (await call("/settings", token, "PUT", { hideBalance: false })).data
          .hideBalance,
        false,
      );
    },
  );
  assert.equal(
    (
      await call(
        "/top-ups",
        token,
        "POST",
        { cardId: "k1", amount: "5000" },
        { "Idempotency-Key": randomUUID() },
      )
    ).status,
    200,
  );
  await t.test(
    "concurrent exchange debits once and creates balanced history entries",
    async () => {
      const before = (await call("/cards", token)).data,
        key = "ex-" + randomUUID(),
        body = { from: "RUB", to: "USD", amount: "925.00" };
      const rates = (await call("/rates", token)).data;
      const expectedMinor = BigInt(Math.round(925 / rates.rates.USD * 100));
      const expectedReceived = String(expectedMinor / 100n) + "." + String(expectedMinor % 100n).padStart(2, "0");
      const [a, b] = await Promise.all([
        call("/exchange", token, "POST", body, { "Idempotency-Key": key }),
        call("/exchange", token, "POST", body, { "Idempotency-Key": key }),
      ]);
      assert.equal(a.status, 200);
      assert.deepEqual(a, b);
      assert.equal(a.data.received, expectedReceived);
      const after = (await call("/cards", token)).data;
      assert.equal(
        BigInt(after.find((c) => c.code === "RUB").balanceMinor),
        BigInt(before.find((c) => c.code === "RUB").balanceMinor) - 92500n,
      );
      assert.equal(
        BigInt(after.find((c) => c.code === "USD").balanceMinor),
        BigInt(before.find((c) => c.code === "USD").balanceMinor) + expectedMinor,
      );
      const entries = (await call("/transactions", token)).data.filter((t) =>
        t.id.startsWith(a.data.id),
      );
      assert.equal(entries.length, 2);
      assert.equal(entries.find((t) => t.code === "RUB").amountMinor, "-92500");
      assert.equal(entries.find((t) => t.code === "USD").amountMinor, String(expectedMinor));
      assert.equal(
        (
          await call(
            "/exchange",
            token,
            "POST",
            { ...body, amount: "926.00" },
            { "Idempotency-Key": key },
          )
        ).status,
        409,
      );
      assert.deepEqual((await call("/cards", token)).data, after);
      assert.equal(
        (
          await call(
            "/exchange",
            token,
            "POST",
            { from: "RUB", to: "RUB", amount: "1.00" },
            { "Idempotency-Key": "ex-" + randomUUID() },
          )
        ).status,
        422,
      );
      assert.equal(
        (
          await call(
            "/exchange",
            token,
            "POST",
            { from: "RUB", to: "USD", amount: "0.01" },
            { "Idempotency-Key": "ex-" + randomUUID() },
          )
        ).status,
        422,
      );
      assert.equal(
        (
          await call(
            "/exchange",
            token,
            "POST",
            { from: "RUB", to: "USD", amount: "9999999999" },
            { "Idempotency-Key": "ex-" + randomUUID() },
          )
        ).status,
        409,
      );
      assert.deepEqual((await call("/cards", token)).data, after);
      assert.equal((await call("/profile-stats", token)).status, 200);
    },
  );
  await t.test(
    "password change requires current secret and revokes existing sessions",
    async () => {
      const values = {
        currentPassword: "Wrong12345",
        password: "NewCardo12345",
        confirmPassword: "NewCardo12345",
      };
      assert.equal(
        (await call("/profile/password", token, "PATCH", values)).status,
        422,
      );
      assert.equal((await call("/profile", token)).status, 200);
      assert.equal(
        (
          await call("/profile/password", token, "PATCH", {
            ...values,
            currentPassword: password,
          })
        ).status,
        200,
      );
      assert.equal((await call("/profile", token)).status, 401);
      assert.equal(
        (await call("/auth/login", null, "POST", { phone, password })).status,
        401,
      );
      assert.equal(
        (
          await call("/auth/login", null, "POST", {
            phone,
            password: values.password,
          })
        ).status,
        200,
      );
      assert.equal((await call("/profile", outsider.data.token)).status, 200);
    },
  );
});
