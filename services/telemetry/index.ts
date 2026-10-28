import { createHash } from "node:crypto";
import { service, route, internal, listen, errors } from "../../packages/shared/http.ts";
import { kafkaClient, bankingTopics, practiceTopics } from "../../packages/shared/kafka.ts";
import { lag, telemetryDropped, telemetryQueued } from "../../packages/shared/metrics.ts";
import { safeLog } from "../../packages/shared/telemetry.ts";
import type { SafeLog } from "../../packages/shared/telemetry.ts";
import { startWorker } from "../../packages/shared/worker.ts";
import { statfs } from "node:fs/promises";
import { Gauge } from "@prometheus-io/client";
import { registry } from "../../packages/shared/metrics.ts";
import { database, migrate } from "../../packages/shared/db.ts";
import { watchConsumer, offsetRange } from "../../packages/shared/kafka-lifecycle.ts";
import { acceptEvent, indexEvents } from "./src/event-store.ts";

new Gauge({
  name: "cardo_storage_available_bytes",
  help: "Available bytes on the filesystem backing the collector container; not a filesystem quota",
  registers: [registry],
  async collect() { const fs = await statfs("/"); this.set(fs.bavail * fs.bsize); },
});
new Gauge({
  name: "cardo_storage_size_bytes",
  help: "Size of the filesystem backing the collector container",
  registers: [registry],
  async collect() { const fs = await statfs("/"); this.set(fs.blocks * fs.bsize); },
});

const elastic = process.env.ELASTIC_URL;
const password = process.env.ELASTIC_WRITER_PASSWORD;
if (!elastic || !password) throw new Error("TELEMETRY_CONFIG_REQUIRED");
const authorization = "Basic " + Buffer.from("cardo_writer:" + password).toString("base64");
const pool = database("telemetry");
await migrate(pool, new URL("./migrations/001-events.sql", import.meta.url));
const durablePending = new Gauge({ name: "cardo_event_index_pending", help: "Durably stored events awaiting indexing", registers: [registry] });
const quarantined = new Gauge({ name: "cardo_event_quarantined", help: "Durably quarantined invalid events", registers: [registry] });
const retentionGap = new Gauge({ name: "cardo_kafka_retention_gap", help: "Committed offsets no longer retained by Kafka", labelNames: ["group", "topic", "partition"], registers: [registry] });
const grafanaUp = new Gauge({ name: "cardo_grafana_up", help: "Grafana HTTP and metadata database health checked outside Grafana", registers: [registry] });
const stopGrafana = startWorker(async () => {
  try {
    const response = await fetch(process.env.GRAFANA_HEALTH_URL || "http://grafana:3000/api/health", { signal: AbortSignal.timeout(5000) });
    const result = await response.json() as { database?: string };
    grafanaUp.set(response.ok && result.database === "ok" ? 1 : 0);
  } catch { grafanaUp.set(0); }
}, 15000);
const stopEvents = startWorker(async () => {
  await indexEvents(pool, elastic, authorization);
  const totals = (await pool.query("SELECT count(*) FILTER(WHERE state='pending')::int AS pending,count(*) FILTER(WHERE state='quarantine')::int AS quarantined FROM telemetry.events")).rows[0];
  durablePending.set(totals.pending);
  quarantined.set(totals.quarantined);
}, 1000);
const queue: SafeLog[] = [];
function enqueue(input: Record<string, unknown>) {
  const entry = safeLog(input);
  if (!entry) return;
  if (queue.length >= 5000) { telemetryDropped.inc({ service: "telemetry" }); return; }
  queue.push(entry);
}
const stopIngest = startWorker(async () => {
  if (!queue.length) return;
  const entries = queue.splice(0, 500);
  const body = entries.flatMap(entry => [JSON.stringify({ create: { _index: "cardo-logs", _id: createHash("sha256").update(JSON.stringify(entry)).digest("hex") } }), JSON.stringify(entry)]).join("\n") + "\n";
  try {
    const response = await fetch(elastic + "/_bulk", { method: "POST", signal: AbortSignal.timeout(5000), headers: { Authorization: authorization, "Content-Type": "application/x-ndjson" }, body });
    if (!response.ok) throw new Error("ELASTIC_UNAVAILABLE");
    const result = await response.json() as { items: { create: { status: number } }[] };
    const retry = entries.filter((_entry, index) => ![201, 409].includes(result.items[index]?.create.status));
    const available = 5000 - queue.length;
    queue.unshift(...retry.slice(0, available));
    if (retry.length > available) telemetryDropped.inc({ service: "telemetry" }, retry.length - available);
  } catch {
    const available = 5000 - queue.length;
    queue.unshift(...entries.slice(0, available));
    if (entries.length > available) telemetryDropped.inc({ service: "telemetry" }, entries.length - available);
  }
  telemetryQueued.set({ service: "telemetry" }, queue.length);
}, 500);
const kafka = kafkaClient("telemetry");
const admin = kafka.admin();
const consumer = kafka.consumer({ groupId: "cardo-practice-audit", allowAutoTopicCreation: false });
const health = watchConsumer(consumer, "telemetry", "cardo-practice-audit");
await admin.connect();
await consumer.connect();
await consumer.subscribe({ topics: practiceTopics, fromBeginning: true });
await consumer.run({ autoCommitInterval: 1000, autoCommitThreshold: 1, eachMessage: async ({ topic, partition, message }) => {
  await acceptEvent(pool, { topic, partition, offset: message.offset, value: message.value?.toString() || "" });
} });
const stopLag = startWorker(async () => {
  for (const [group, topics] of [["cardo-engagement", bankingTopics], ["cardo-practice-audit", practiceTopics]] as const) {
    const offsets = await admin.fetchOffsets({ groupId: group, topics });
    for (const topic of topics) {
      const end = await admin.fetchTopicOffsets(topic);
      for (const partition of end) {
        const committed = offsets.find(item => item.topic === topic)?.partitions.find(item => item.partition === partition.partition)?.offset || "-1";
        const range = offsetRange(partition.low, partition.high, committed);
        const labels = { group, topic, partition: String(partition.partition) };
        lag.set(labels, range.lag);
        retentionGap.set(labels, range.gap);
      }
    }
  }
}, 15000);
const app = service("telemetry", "256kb");
app.get("/health", route(async (_req, res) => {
  await pool.query("SELECT 1");
  res.status(health.ready() ? 200 : 503).json({ status: health.ready() ? "ok" : "recovering", service: "telemetry" });
}));
app.post("/internal/logs", internal, route(async (req, res) => {
  if (!Array.isArray(req.body) || req.body.length > 100) return res.sendStatus(422);
  for (const item of req.body) if (item && typeof item === "object") enqueue(item);
  res.sendStatus(202);
}));
errors(app);
listen(app, Number(process.env.PORT || 8086), async () => { health.close(); await Promise.all([stopIngest(), stopLag(), stopEvents(), stopGrafana()]); await consumer.stop(); await consumer.disconnect(); await admin.disconnect(); await pool.end(); });
