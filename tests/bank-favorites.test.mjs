import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { createBankingApp } from "../services/banking/src/app.ts";
import { banks } from "../services/banking/src/banks.ts";
import openapi from "../services/gateway/openapi.ts";
const integration = process.env.CARDO_BANKING_INTEGRATION === "1";
const internal = process.env.INTERNAL_TOKEN || "cardo-local-internal";
test("Favorite API documents account preferences and safe repeated mutations", () => {
  for (const method of ["put", "delete"]) {
    const operation = openapi.paths["/banks/{bankId}/favorite"][method];
    assert.deepEqual(
      operation.parameters[0].schema.enum,
      banks.map((bank) => bank.id),
    );
    assert.equal(operation.parameters[0].required, true);
    assert.equal(Object.hasOwn(operation, "requestBody"), false);
    assert.deepEqual(
      operation.responses["200"].content["application/json"].schema.items
        .required,
      ["id", "name", "favorite"],
    );
    assert.ok(operation.responses["401"]);
    assert.ok(operation.responses["422"]);
  }
});
test(
  "Bank favorites persist for each account without altering banking data",
  { skip: !integration },
  async (t) => {
    const connectionString =
      process.env.TEST_BANKING_DATABASE_URL ||
      "postgres://cardo_banking:cardo_banking_dev@127.0.0.1:5434/cardo";
    const pool = new pg.Pool({ connectionString });
    const users = [
      { id: randomUUID(), name: "Первый Избранное" },
      { id: randomUUID(), name: "Второй Избранное" },
    ];
    const app = createBankingApp(pool, {
      async quote() {
        throw new Error("Not used");
      },
    });
    const server = await new Promise((resolve) => {
      const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
    });
    const base = "http://127.0.0.1:" + server.address().port;
    const request = async (user, route, method = "GET", body, headers = {}) => {
      const response = await fetch(base + route, {
        method,
        headers: {
          "Content-Type": "application/json",
          "X-Internal-Token": internal,
          ...(user
            ? {
                "X-User-Id": user.id,
                "X-User-Name": encodeURIComponent(user.name),
              }
            : {}),
          ...headers,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return { status: response.status, data: await response.json() };
    };
    const favoriteIds = (catalog) =>
      catalog.filter((bank) => bank.favorite).map((bank) => bank.id);
    const catalog = async (user) => {
      const response = await request(user, "/api/banks");
      assert.equal(response.status, 200);
      assert.deepEqual(
        response.data.map((bank) => bank.id),
        banks.map((bank) => bank.id),
      );
      return response.data;
    };
    const saved = async (user) =>
      (
        await pool.query(
          "SELECT bank_id,created_at FROM banking.bank_favorites WHERE user_id=$1 ORDER BY bank_id",
          [user.id],
        )
      ).rows;
    const financial = async () => {
      const snapshot = {};
      for (const table of [
        "accounts",
        "cards",
        "limits",
        "transactions",
        "receipts",
        "outbox",
      ]) {
        snapshot[table] = (
          await pool.query(
            "SELECT row_to_json(record) AS value FROM banking." +
              table +
              " AS record WHERE user_id=ANY($1::uuid[]) ORDER BY user_id,row_to_json(record)::text",
            [users.map((user) => user.id)],
          )
        ).rows;
      }
      return snapshot;
    };
    t.after(async () => {
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeIdleConnections();
      });
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        for (const table of [
          "recipients",
          "outbox",
          "receipts",
          "transactions",
          "limits",
          "cards",
          "accounts",
          "workspaces",
        ]) {
          await client.query(
            "DELETE FROM banking." + table + " WHERE user_id=ANY($1::uuid[])",
            [users.map((user) => user.id)],
          );
        }
        await client.query("COMMIT");
        assert.equal(
          (
            await client.query(
              "SELECT user_id FROM banking.bank_favorites WHERE user_id=ANY($1::uuid[])",
              [users.map((user) => user.id)],
            )
          ).rowCount,
          0,
        );
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
        await pool.end();
      }
    });
    let baseline;
    await t.test(
      "new accounts start with Cardo and catalog reads do not recreate preferences",
      async () => {
        for (const user of users)
          assert.deepEqual(favoriteIds(await catalog(user)), ["cardo"]);
        const before = await saved(users[0]);
        for (let i = 0; i < 3; i++) await catalog(users[0]);
        assert.deepEqual(await saved(users[0]), before);
        baseline = await financial();
      },
    );
    await t.test(
      "adding and removing favorites is repeatable and account scoped",
      async () => {
        const route = "/api/banks/sber/favorite";
        const added = await request(users[0], route, "PUT", {
          userId: users[1].id,
        });
        assert.equal(added.status, 200);
        assert.deepEqual(favoriteIds(added.data), ["cardo", "sber"]);
        const beforeRetry = await saved(users[0]);
        assert.deepEqual(
          (await request(users[0], route, "PUT")).data,
          added.data,
        );
        assert.deepEqual(await saved(users[0]), beforeRetry);
        assert.deepEqual(favoriteIds(await catalog(users[1])), ["cardo"]);
        const other = await request(
          users[1],
          "/api/banks/wise/favorite",
          "PUT",
          { userId: users[0].id },
        );
        assert.deepEqual(favoriteIds(other.data), ["cardo", "wise"]);
        assert.deepEqual(favoriteIds(await catalog(users[0])), [
          "cardo",
          "sber",
        ]);
        const removed = await request(users[0], route, "DELETE");
        assert.equal(removed.status, 200);
        assert.deepEqual(favoriteIds(removed.data), ["cardo"]);
        assert.deepEqual(
          (await request(users[0], route, "DELETE")).data,
          removed.data,
        );
        assert.deepEqual(favoriteIds(await catalog(users[1])), [
          "cardo",
          "wise",
        ]);
      },
    );
    await t.test(
      "Cardo removal survives catalog reads, provisioning and new application instances",
      async () => {
        const removed = await request(
          users[0],
          "/api/banks/cardo/favorite",
          "DELETE",
        );
        assert.equal(removed.status, 200);
        assert.deepEqual(favoriteIds(removed.data), []);
        assert.deepEqual(favoriteIds(await catalog(users[0])), []);
        const provision = await request(
          users[0],
          "/internal/provision",
          "POST",
          { userId: users[0].id, name: users[0].name },
        );
        assert.equal(provision.status, 200);
        assert.equal(provision.data.created, false);
        assert.deepEqual(favoriteIds(await catalog(users[0])), []);
        const secondApp = createBankingApp(pool, {
          async quote() {
            throw new Error("Not used");
          },
        });
        const secondServer = await new Promise((resolve) => {
          const listening = secondApp.listen(0, "127.0.0.1", () =>
            resolve(listening),
          );
        });
        try {
          const response = await fetch(
            "http://127.0.0.1:" + secondServer.address().port + "/api/banks",
            {
              headers: {
                "X-Internal-Token": internal,
                "X-User-Id": users[0].id,
              },
            },
          );
          assert.equal(response.status, 200);
          assert.deepEqual(favoriteIds(await response.json()), []);
        } finally {
          await new Promise((resolve, reject) => {
            secondServer.close((error) => (error ? reject(error) : resolve()));
            secondServer.closeIdleConnections();
          });
        }
        assert.deepEqual(favoriteIds(await catalog(users[1])), [
          "cardo",
          "wise",
        ]);
      },
    );
    await t.test(
      "concurrent retries and different bank changes have no duplicates or lost preferences",
      async () => {
        const ids = ["tbank", "vtb", "sber", "alfa", "ozon", "sovcombank"];
        const additions = await Promise.all(
          ids.flatMap((id) =>
            Array.from({ length: 3 }, () =>
              request(users[0], "/api/banks/" + id + "/favorite", "PUT"),
            ),
          ),
        );
        assert.ok(additions.every((response) => response.status === 200));
        assert.deepEqual(
          new Set(favoriteIds(await catalog(users[0]))),
          new Set(ids),
        );
        assert.equal((await saved(users[0])).length, ids.length);
        const removals = await Promise.all(
          ids.flatMap((id) =>
            Array.from({ length: 3 }, () =>
              request(users[0], "/api/banks/" + id + "/favorite", "DELETE"),
            ),
          ),
        );
        assert.ok(removals.every((response) => response.status === 200));
        assert.deepEqual(favoriteIds(await catalog(users[0])), []);
        assert.deepEqual(favoriteIds(await catalog(users[1])), [
          "cardo",
          "wise",
        ]);
      },
    );
    await t.test(
      "unknown banks, untrusted calls and missing user context cannot alter preferences",
      async () => {
        const before = await saved(users[0]);
        for (const method of ["PUT", "DELETE"]) {
          const unknown = await request(
            users[0],
            "/api/banks/unknown/favorite",
            method,
          );
          assert.equal(unknown.status, 422);
          assert.equal(unknown.data.error.code, "INVALID_BANK");
          assert.equal(
            (
              await request(
                users[0],
                "/api/banks/sber/favorite",
                method,
                undefined,
                { "X-Internal-Token": "invalid" },
              )
            ).status,
            403,
          );
          assert.equal(
            (await request(null, "/api/banks/sber/favorite", method)).status,
            401,
          );
        }
        assert.deepEqual(await saved(users[0]), before);
        assert.deepEqual(await financial(), baseline);
      },
    );
    await t.test(
      "QA can inspect favorites but cannot write the table",
      async () => {
        const url = new URL(connectionString);
        url.username = "cardo_qa";
        url.password = "cardo_qa_dev";
        const readonly = new pg.Pool({
          connectionString: process.env.TEST_QA_DATABASE_URL || url.toString(),
        });
        try {
          assert.equal(
            (
              await readonly.query(
                "SELECT bank_id FROM banking.bank_favorites WHERE user_id=$1",
                [users[1].id],
              )
            ).rowCount,
            2,
          );
          for (const sql of [
            "INSERT INTO banking.bank_favorites(user_id,bank_id) VALUES($1,'sber')",
            "UPDATE banking.bank_favorites SET bank_id='sber' WHERE user_id=$1",
            "DELETE FROM banking.bank_favorites WHERE user_id=$1",
          ])
            await assert.rejects(
              readonly.query(sql, [users[1].id]),
              (error) => error.code === "42501",
            );
          assert.deepEqual(favoriteIds(await catalog(users[1])), [
            "cardo",
            "wise",
          ]);
        } finally {
          await readonly.end();
        }
      },
    );
  },
);
