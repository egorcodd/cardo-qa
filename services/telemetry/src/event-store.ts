import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { safeLog } from "../../../packages/shared/telemetry.ts";

type Input = { topic: string; partition?: number; offset?: string; value: string; origin?: "live" | "recovered" };
export async function acceptEvent(pool: Pick<Pool, "query">, input: Input) {
  let value: Record<string, unknown> = {}, invalid = false;
  try {
    const parsed = input.value.length <= 65536 ? JSON.parse(input.value) : null;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    value = parsed;
  } catch { invalid = true; }
  const eventId = typeof value.eventId === "string" && /^[A-Za-z0-9_.:-]{1,120}$/.test(value.eventId) ? value.eventId : null;
  const timestamp = typeof value.occurredAt === "string" && !Number.isNaN(Date.parse(value.occurredAt)) ? new Date(value.occurredAt).toISOString() : null;
  if (!eventId || !timestamp || !["banking.transfer.completed","banking.external-transfer.completed","banking.top-up.completed","engagement.notification.created"].includes(String(value.type))) invalid = true;
  const id = createHash("sha256").update(input.topic + ":" + (eventId || `${input.partition}:${input.offset}`)).digest("hex");
  const origin = input.origin || "live";
  const entry = safeLog({ ...value, "@timestamp": timestamp, service: "telemetry", level: invalid ? "error" : "info", message: invalid ? "event.quarantined" : "event.observed", topic: input.topic, partition: input.partition, offset: input.offset, group: "cardo-practice-audit", origin, ...(invalid ? { errorCode: "INVALID_EVENT" } : {}) })!;
  const business = Object.fromEntries(["@timestamp","eventId","requestId","type","operationId","amount","currency","causationId","notificationId","kind","category"].filter(key => entry[key] !== undefined).map(key => [key,entry[key]]));
  const hash = createHash("sha256").update(JSON.stringify(business)).digest("hex");
  await pool.query(`INSERT INTO telemetry.events(id,topic,event_id,source_partition,source_offset,occurred_at,kafka_observed_at,origin,payload,state,last_code,payload_hash)
    VALUES($1,$2,$3,$4,$5,$6,CASE WHEN $7='live' THEN now() ELSE NULL END,$7,$8,$9,$10,$11)
    ON CONFLICT(id) DO UPDATE SET
      state=CASE WHEN telemetry.events.payload_hash<>EXCLUDED.payload_hash THEN 'quarantine' ELSE telemetry.events.state END,
      last_code=CASE WHEN telemetry.events.payload_hash<>EXCLUDED.payload_hash THEN 'PAYLOAD_CONFLICT' ELSE telemetry.events.last_code END,
      kafka_observed_at=COALESCE(telemetry.events.kafka_observed_at,EXCLUDED.kafka_observed_at),
      source_partition=COALESCE(EXCLUDED.source_partition,telemetry.events.source_partition),
      source_offset=COALESCE(EXCLUDED.source_offset,telemetry.events.source_offset)`,
    [id,input.topic,eventId,input.partition ?? null,input.offset ?? null,timestamp || new Date().toISOString(),origin,JSON.stringify(entry),invalid ? "quarantine" : "pending",invalid ? "INVALID_EVENT" : null,hash]);
}
export async function indexEvents(pool: Pick<Pool, "query">, elastic: string, authorization: string, send: typeof fetch = fetch) {
  const rows = (await pool.query("SELECT id,payload,occurred_at,attempts FROM telemetry.events WHERE state='pending' AND next_attempt_at<=now() ORDER BY next_attempt_at LIMIT 100")).rows;
  if (!rows.length) return;
  const body = rows.flatMap(row => [JSON.stringify({ create: { _index: "cardo-events-" + new Date(row.occurred_at).toISOString().slice(0,10).replaceAll("-","."), _id: row.id } }), JSON.stringify(row.payload)]).join("\n") + "\n";
  let statuses: number[] = [];
  try {
    const response = await send(elastic + "/_bulk", { method: "POST", signal: AbortSignal.timeout(5000), headers: { Authorization: authorization, "Content-Type": "application/x-ndjson" }, body });
    if (response.ok) {
      const result = await response.json() as { items?: { create?: { status?: number } }[] };
      statuses = rows.map((_row, i) => result.items?.[i]?.create?.status || 503);
    }
  } catch { /* The durable row remains pending until an acknowledged item succeeds. */ }
  for (const [index,row] of rows.entries()) {
    const status = statuses[index] || 503;
    if (status === 201 || status === 409) {
      await pool.query("UPDATE telemetry.events SET state='indexed',indexed_at=now(),last_code=NULL,attempts=attempts+1 WHERE id=$1", [row.id]);
    } else {
      const permanent = [400,413,422].includes(status);
      await pool.query(`UPDATE telemetry.events SET state=$2,attempts=attempts+1,last_code=$3,next_attempt_at=now()+make_interval(secs=>$4) WHERE id=$1`, [row.id, permanent ? "quarantine" : "pending", "ELASTIC_ITEM_"+status, Math.min(300,2 ** Math.min(row.attempts+1,8))]);
    }
  }
}
