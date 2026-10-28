import { telemetryDropped, telemetryQueued, eventType, routeLabel } from "./metrics.ts";
import { createHash } from "node:crypto";

const services = new Set(["gateway", "customer", "banking", "engagement", "rates", "telemetry"]);
const messages = new Set(["http.request", "http.error", "event.published", "event.retry", "event.processed", "event.duplicate", "event.dead_letter", "event.observed", "event.quarantined", "outbox.failed", "kafka.connection", "kafka.lifecycle", "telemetry.failed"]);
export type SafeLog = Record<string, string | number>;
export function safeLog(input: Record<string, unknown>): SafeLog | null {
  if (!services.has(String(input.service)) || !messages.has(String(input.message)) || !["info", "warn", "error"].includes(String(input.level))) return null;
  if (input.message === "http.request" && Number(input.status) < 400) {
    const mutation = ["POST", "PUT", "PATCH", "DELETE"].includes(String(input.method)) && String(input.route).startsWith("/api/");
    const detail = input.method === "GET" && /^\/api\/(?:transactions\/:id|cards\/:id\/(?:requisites|account-requisites))$/.test(String(input.route));
    if (!mutation && !detail) return null;
  }
  const output: SafeLog = { "@timestamp": new Date().toISOString(), service: String(input.service), level: String(input.level), message: String(input.message) };
  if (typeof input["@timestamp"] === "string" && /^\d{4}-\d{2}-\d{2}T/.test(input["@timestamp"]) && !Number.isNaN(Date.parse(input["@timestamp"]))) output["@timestamp"] = new Date(input["@timestamp"]).toISOString();
  for (const key of ["requestId", "eventId", "causationId", "notificationId", "operationId", "topic", "group", "errorCode", "offset", "currency", "method", "kind", "category", "origin"])
    if (typeof input[key] === "string" && /^[A-Za-z0-9_.:-]{1,120}$/.test(input[key] as string)) output[key] = input[key] as string;
  if (input.type) output.type = eventType(input.type);
  if (typeof input.route === "string") output.route = routeLabel(input.route);
  for (const key of ["status", "durationMs", "partition", "attempt"])
    if (typeof input[key] === "number" && Number.isFinite(input[key]) && (input[key] as number) >= 0) output[key] = input[key] as number;
  if (typeof input.amount === "string" && /^\d{1,10}\.\d{2}$/.test(input.amount)) output.amount = input.amount;
  return output;
}

const queue: SafeLog[] = [];
const endpoint = process.env.TELEMETRY_URL;
let flushing: Promise<void> | null = null;
export function log(service: string, level: string, message: string, fields: Record<string, unknown> = {}) {
  const entry = safeLog({ ...fields, service, level, message });
  if (!entry) return;
  console[level === "error" ? "error" : "log"](JSON.stringify(entry));
  if (!endpoint) return;
  if (queue.length >= 1000) { telemetryDropped.inc({ service }); return; }
  queue.push(entry);
  telemetryQueued.set({ service }, queue.filter(item => item.service === service).length);
}
export async function flushLogs() {
  if (flushing) return flushing;
  if (!endpoint || !queue.length) return;
  flushing = (async () => {
    const batch = queue.splice(0, 100);
    try {
      const response = await fetch(endpoint + "/internal/logs", { method: "POST", signal: AbortSignal.timeout(2000), headers: { "Content-Type": "application/json", "X-Internal-Token": process.env.INTERNAL_TOKEN || "cardo-local-internal" }, body: JSON.stringify(batch) });
      if (!response.ok) throw new Error("INGEST_UNAVAILABLE");
    } catch {
      queue.unshift(...batch.slice(0, 1000 - queue.length));
    } finally {
      for (const service of services) telemetryQueued.set({ service }, queue.filter(item => item.service === service).length);
    }
  })().finally(() => { flushing = null; });
  return flushing;
}
if (endpoint) setInterval(() => { void flushLogs(); }, 1000).unref();

export function publicEvent(event: Record<string, unknown>) {
  const payload = event.payload && typeof event.payload === "object" ? event.payload as Record<string, unknown> : {};
  const fields = safeLog({ service: "banking", level: "info", message: "event.published", requestId: event.requestId, eventId: event.id, type: event.type, operationId: payload.operationId || payload.senderOperationId || payload.transferId, currency: payload.currency, amount: payload.amount })!;
  return { eventId: fields.eventId, requestId: fields.requestId, type: fields.type, version: event.version === 2 ? 2 : 1, occurredAt: typeof event.occurredAt === "string" && !Number.isNaN(Date.parse(event.occurredAt)) ? new Date(event.occurredAt).toISOString() : fields["@timestamp"], operationId: fields.operationId, amount: fields.amount, currency: fields.currency, accountRef: createHash("sha256").update(String(event.userId)).digest("hex").slice(0, 12) };
}
