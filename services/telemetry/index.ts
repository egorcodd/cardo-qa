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
    queue.unshift(...retry.slice(0, 5000 - queue.length));
  } catch { queue.unshift(...entries.slice(0, 5000 - queue.length)); }
  telemetryQueued.set({ service: "telemetry" }, queue.length);
}, 500);
const kafka = kafkaClient("telemetry");
const admin = kafka.admin();
const consumer = kafka.consumer({ groupId: "cardo-practice-audit", allowAutoTopicCreation: false });
await admin.connect();
await consumer.connect();
await consumer.subscribe({ topics: practiceTopics, fromBeginning: true });
await consumer.run({ autoCommitInterval: 1000, autoCommitThreshold: 1, eachMessage: async ({ topic, partition, message }) => {
  const payload = JSON.parse(message.value?.toString() || "{}") as Record<string, unknown>;
  enqueue({ ...payload, "@timestamp": payload.occurredAt, level: "info", service: "telemetry", message: "event.observed", topic, partition, offset: message.offset, group: "cardo-practice-audit" });
} });
const stopLag = startWorker(async () => {
  for (const [group, topic] of [...bankingTopics.map(topic => ["cardo-engagement", topic]), ...practiceTopics.map(topic => ["cardo-practice-audit", topic])]) {
    const end = await admin.fetchTopicOffsets(topic);
    const offsets = await admin.fetchOffsets({ groupId: group, topics: [topic] });
    for (const partition of end) {
      const committed = offsets[0]?.partitions.find(item => item.partition === partition.partition)?.offset || "0";
      const count = BigInt(partition.high) - (BigInt(committed) < 0n ? 0n : BigInt(committed));
      lag.set({ group, topic, partition: String(partition.partition) }, Math.max(0, Number(count)));
    }
  }
}, 5000);
const app = service("telemetry", "256kb");
app.get("/health", (_req, res) => res.json({ status: "ok", service: "telemetry" }));
app.post("/internal/logs", internal, route(async (req, res) => {
  if (!Array.isArray(req.body) || req.body.length > 100) return res.sendStatus(422);
  for (const item of req.body) if (item && typeof item === "object") enqueue(item);
  res.sendStatus(202);
}));
errors(app);
listen(app, Number(process.env.PORT || 8086), async () => { await Promise.all([stopIngest(), stopLag()]); await consumer.stop(); await consumer.disconnect(); await admin.disconnect(); });
