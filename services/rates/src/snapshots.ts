import type { Pool } from "pg";
import { transaction } from "../../../packages/shared/db.ts";
import { fail } from "../../../packages/shared/http.ts";
import type { OfficialRates } from "./provider.ts";

export type RateSnapshot = OfficialRates & {
  base: string;
  source: "cbr";
  publishedAt: string;
};
export type RateSyncState = {
  attemptedAt: string;
  succeededAt: string | null;
  errorCode: string | null;
};
export type RateStore = {
  latest(): Promise<RateSnapshot | null>;
  state(): Promise<RateSyncState | null>;
  save(rates: OfficialRates, checkedAt: string): Promise<void>;
  failure(checkedAt: string, code: string): Promise<void>;
};

function iso(value: Date | string) {
  return new Date(value).toISOString();
}

export function snapshotStore(pool: Pool): RateStore {
  return {
    async latest() {
      const row = (
        await pool.query(
          "SELECT id,base,rub_per_unit_scaled,source,published_at,to_char(effective_date,'YYYY-MM-DD') AS effective_date FROM rates.snapshots WHERE source='cbr' AND effective_date IS NOT NULL ORDER BY effective_date DESC,published_at DESC,id DESC LIMIT 1",
        )
      ).rows[0];
      if (!row) return null;
      const units = row.rub_per_unit_scaled as Record<string, string>;
      if (!units || typeof units !== "object" || Array.isArray(units))
        fail(503, "INVALID_RATES", "Курсы временно недоступны");
      for (const value of Object.values(units))
        if (typeof value !== "string" || !/^[1-9]\d{0,12}$/.test(value))
          fail(503, "INVALID_RATES", "Курсы временно недоступны");
      if (row.base !== "RUB" || units.RUB !== "10000" || !units.USD || !units.EUR)
        fail(503, "INVALID_RATES", "Курсы временно недоступны");
      return {
        version: String(row.id),
        base: row.base,
        units,
        source: "cbr",
        effectiveDate: row.effective_date,
        publishedAt: iso(row.published_at),
      };
    },
    async state() {
      const row = (await pool.query("SELECT * FROM rates.sync_state WHERE id=true")).rows[0];
      return row ? {
        attemptedAt: iso(row.attempted_at),
        succeededAt: row.succeeded_at ? iso(row.succeeded_at) : null,
        errorCode: row.error_code,
      } : null;
    },
    async save(rates, checkedAt) {
      await transaction(pool, async (client) => {
        await client.query(
          "INSERT INTO rates.snapshots(id,base,rub_per_unit_scaled,source,effective_date,published_at) VALUES($1,'RUB',$2,'cbr',$3,$4) ON CONFLICT(id) DO NOTHING",
          [rates.version, rates.units, rates.effectiveDate, checkedAt],
        );
        await client.query(
          "INSERT INTO rates.sync_state(id,attempted_at,succeeded_at,error_code) VALUES(true,$1,$1,NULL) ON CONFLICT(id) DO UPDATE SET attempted_at=excluded.attempted_at,succeeded_at=excluded.succeeded_at,error_code=NULL",
          [checkedAt],
        );
      });
    },
    async failure(checkedAt, code) {
      await pool.query(
        "INSERT INTO rates.sync_state(id,attempted_at,error_code) VALUES(true,$1,$2) ON CONFLICT(id) DO UPDATE SET attempted_at=excluded.attempted_at,error_code=excluded.error_code",
        [checkedAt, code],
      );
    },
  };
}

export async function currentSnapshot(pool: Pool) {
  const store = snapshotStore(pool);
  const [snapshot, state] = await Promise.all([store.latest(), store.state()]);
  if (!snapshot) fail(503, "RATES_UNAVAILABLE", "Курсы временно недоступны");
  return {
    ...snapshot,
    fetchedAt: state?.succeededAt || snapshot.publishedAt,
    stale: Boolean(state?.errorCode) || !state?.succeededAt || Date.now() - Date.parse(state.succeededAt) > 2 * 60 * 60 * 1000,
  };
}
