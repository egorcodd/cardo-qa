import pg from "pg";
import { readFile } from "node:fs/promises";
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
  await transaction(pool, async (c) => {
    await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      file.pathname,
    ]);
    await c.query(await readFile(file, "utf8"));
  });
}
