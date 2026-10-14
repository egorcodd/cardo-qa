import { Gauge } from "@prometheus-io/client";
import type { Pool } from "pg";
import { registry } from "../../../packages/shared/metrics.ts";
import { transaction } from "../../../packages/shared/db.ts";

const kinds: Record<string, string> = {
  "banking.transfer.completed": "transfer",
  "banking.external-transfer.completed": "external_transfer",
  "banking.top-up.completed": "topup",
};

export function operationMetrics(pool: Pool) {
  return new Gauge({
    name: "cardo_completed_operations",
    help: "Unique financial operations committed with their PostgreSQL outbox record; excludes seeded history and HTTP retries",
    labelNames: ["kind", "currency", "window"],
    registers: [registry],
    async collect() {
      const result = await transaction(pool, async client => {
        await client.query("SET LOCAL statement_timeout='3s'");
        await client.query("SET TRANSACTION READ ONLY");
        return client.query(
          "SELECT payload->>'type' AS type,payload->'payload'->>'currency' AS currency,count(*)::int AS total,count(*) FILTER (WHERE created_at>=now()-interval '24 hours')::int AS day FROM banking.outbox WHERE payload->>'type'=ANY($1::text[]) GROUP BY 1,2",
          [Object.keys(kinds)],
        );
      });
      for (const [type, kind] of Object.entries(kinds))
        for (const currency of ["RUB", "USD", "EUR"]) {
          const row = result.rows.find(item => item.type === type && item.currency === currency);
          this.set({ kind, currency, window: "all" }, row?.total || 0);
          this.set({ kind, currency, window: "24h" }, row?.day || 0);
        }
    },
  });
}
