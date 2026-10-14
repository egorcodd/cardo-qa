import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { migrate } from "../packages/shared/db.ts";
const hash = text => createHash("sha256").update(text).digest("hex");
const original = "CREATE TABLE customer.example (id text PRIMARY KEY);\n";
async function fixture(fileText, storedChecksum, check) {
 const directory = await mkdtemp(join(tmpdir(), "cardo-migration-test-"));
 const folder = join(directory, "customer", "migrations");
 await mkdir(folder, { recursive: true });
 const file = join(folder, "001-initial.sql");
 await writeFile(file, fileText);
 const calls = [];
 const client = { query: async (sql, params) => { calls.push({ sql, params }); return { rows: sql.startsWith("SELECT checksum") ? [{ checksum: storedChecksum }] : [] }; }, release() {} };
 try { await check({ connect: async () => client }, pathToFileURL(file), calls); }
 finally { await rm(directory, { recursive: true, force: true }); }
}
test("already applied migration survives Git newline conversion without rerunning SQL or rewriting its ledger", async () => {
 for (const [file, stored] of [[original, hash(original.replace(/\n/g, "\r\n"))], [original.replace(/\n/g, "\r\n"), hash(original)]]) {
  await fixture(file, stored, async (pool, url, calls) => {
   await migrate(pool, url);
   assert.ok(calls.some(call => call.sql === "COMMIT"));
   assert.ok(!calls.some(call => call.sql === original || call.sql === file));
   assert.ok(!calls.some(call => /^(?:UPDATE|INSERT INTO) customer\.schema_migrations/.test(call.sql)));
  });
 }
});
test("migration guard still rejects a substantive SQL edit and rolls the transaction back", async () => {
 await fixture("CREATE TABLE customer.example (id bigint PRIMARY KEY);\n", hash(original), async (pool, url, calls) => {
  await assert.rejects(migrate(pool, url), /Applied migration changed/);
  assert.equal(calls.at(-1).sql, "ROLLBACK");
  assert.ok(!calls.some(call => call.sql.startsWith("CREATE TABLE customer.example")));
 });
});
