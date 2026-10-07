import type { Pool } from "pg";
import { fail } from "../../../packages/shared/http.ts";
export async function currentSnapshot(pool: Pool) {
  const snapshot = (
    await pool.query(
      "SELECT * FROM rates.snapshots ORDER BY published_at DESC,id DESC LIMIT 1",
    )
  ).rows[0];
  if (!snapshot) fail(503, "RATES_UNAVAILABLE", "Курсы временно недоступны");
  const units = snapshot.rub_per_unit_scaled as Record<string, string>;
  for (const value of Object.values(units))
    if (typeof value !== "string" || !/^[1-9]\d{0,12}$/.test(value))
      fail(503, "INVALID_RATES", "Курсы временно недоступны");
  for (const currency of ["RUB", "USD", "EUR"])
    if (!units[currency])
      fail(503, "INVALID_RATES", "Курсы временно недоступны");
  return {
    version: String(snapshot.id),
    base: snapshot.base,
    units,
    source: snapshot.source,
    publishedAt: snapshot.published_at,
  };
}
