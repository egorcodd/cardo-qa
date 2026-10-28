import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import pg from "pg";
import { publicEvent } from "../../packages/shared/telemetry.ts";
import { operationTopics } from "../../packages/shared/kafka.ts";
import { acceptEvent } from "./src/event-store.ts";

const [mode,path] = process.argv.slice(2);
if (!["--dry-run","--apply"].includes(mode) || !path || !process.env.BANKING_DATABASE_URL || !process.env.DATABASE_URL) throw new Error("RECOVERY_CONFIG_REQUIRED");
const banking = new pg.Pool({ connectionString: process.env.BANKING_DATABASE_URL, max: 1, statement_timeout: 10000 });
const store = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1, statement_timeout: 10000 });
type Record = { eventId: string; topic: string; value: string; hash: string };
try {
  const rows = (await banking.query("SELECT id,payload FROM banking.outbox WHERE payload->>'type' IN ('banking.transfer.completed','banking.external-transfer.completed','banking.top-up.completed') ORDER BY id")).rows;
  const records: Record[] = rows.map(row => {
    const value = JSON.stringify(publicEvent(row.payload));
    return { eventId: row.id, topic: operationTopics(row.payload.type).public, value, hash: createHash("sha256").update(value).digest("hex") };
  });
  if (mode === "--dry-run") {
    await writeFile(path, JSON.stringify({ createdAt: new Date().toISOString(), records: records.map(({eventId,topic,hash}) => ({eventId,topic,hash})) }, null, 2), { mode: 0o600, flag: "wx" });
    console.log(JSON.stringify({ mode, events: records.length, writes: 0 }));
  } else {
    const manifest = JSON.parse(await readFile(path, "utf8")) as { records: Pick<Record,"eventId" | "topic" | "hash">[] };
    const planned = manifest.records.map(item => {
      const record = records.find(row => row.eventId === item.eventId && row.topic === item.topic && row.hash === item.hash);
      if (!record) throw new Error("RECOVERY_SOURCE_CHANGED");
      return record;
    });
    for (const record of planned) await acceptEvent(store, { topic: record.topic, value: record.value, origin: "recovered" });
    console.log(JSON.stringify({ mode, events: planned.length, origin: "recovered", financialWrites: 0, kafkaPublishes: 0 }));
  }
} finally { await banking.end(); await store.end(); }
