import pg from "pg";
import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { PoolClient } from "pg";
export function database(owner: string) {
  return new pg.Pool({
    connectionString:
      process.env.DATABASE_URL ||
      "postgres://cardo_" +
        owner +
        ":cardo_" +
        owner +
        "_dev@127.0.0.1:5434/cardo",
    max: 10,
    connectionTimeoutMillis: 5000,
  });
}
export async function transaction<T>(
  pool: pg.Pool,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const result = await fn(c);
    await c.query("COMMIT");
    return result;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
export async function migrate(pool: pg.Pool, file: URL) {
  const directory = path.dirname(fileURLToPath(file));
  const owner = path.basename(path.dirname(directory));
  if (!["customer", "banking", "engagement", "rates"].includes(owner))
    throw new Error("Unknown migration owner");
  const files = (await readdir(directory))
    .filter((name) => /^\d{3}-[\w-]+\.sql$/.test(name))
    .sort();
  await transaction(pool, async (c) => {
    await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      "cardo.migrations." + owner,
    ]);
    await c.query(
      "CREATE TABLE IF NOT EXISTS " +
        owner +
        ".schema_migrations (name text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())",
    );
    for (const name of files) {
      const sql = await readFile(path.join(directory, name), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const previous = (
        await c.query(
          "SELECT checksum FROM " + owner + ".schema_migrations WHERE name=$1",
          [name],
        )
      ).rows[0];
      if (previous) {
        if (previous.checksum !== checksum)
          throw new Error("Applied migration changed: " + owner + "/" + name);
        continue;
      }
      await c.query(sql);
      await c.query(
        "INSERT INTO " +
          owner +
          ".schema_migrations(name,checksum) VALUES($1,$2)",
        [name, checksum],
      );
    }
  });
}
