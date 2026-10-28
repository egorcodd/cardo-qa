import { setTimeout as delay } from "node:timers/promises";
import { kafkaClient, topics, bankingTopics } from "../../../../packages/shared/kafka.ts";
import { HttpError } from "../../../../packages/shared/http.ts";
import { events, eventType } from "../../../../packages/shared/metrics.ts";
import { log, publicEvent } from "../../../../packages/shared/telemetry.ts";
import { processEvent } from "../features/events.ts";
import type { Pool } from "pg";
import { watchConsumer } from "../../../../packages/shared/kafka-lifecycle.ts";

export async function startEventConsumer(pool: Pool) {
  const kafka = kafkaClient("engagement");
  const consumer = kafka.consumer({ groupId: "cardo-engagement", allowAutoTopicCreation: false, sessionTimeout: 30000 });
  const producer = kafka.producer({ allowAutoTopicCreation: false });
  const health = watchConsumer(consumer, "engagement", "cardo-engagement");
  await producer.connect();
  await consumer.connect();
  await consumer.subscribe({ topics: bankingTopics, fromBeginning: true });
  await consumer.run({ autoCommit: true, autoCommitInterval: 1000, autoCommitThreshold: 1, eachMessage: async ({ topic, partition, message, heartbeat }) => {
    let event: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(message.value?.toString() || "");
      event = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
    } catch { event = {}; }
    const projection = publicEvent(event);
    const context = { ...projection, topic, partition, offset: message.offset, group: "cardo-engagement" };
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const processed = await processEvent(pool, event);
        events.inc({ service: "engagement", type: eventType(event.type), stage: "consume", result: processed ? "ok" : "duplicate" });
        log("engagement", "info", processed ? "event.processed" : "event.duplicate", context);
        break;
      } catch (error) {
        if (!(error instanceof HttpError)) throw error;
        events.inc({ service: "engagement", type: eventType(event.type), stage: "consume", result: "error" });
        log("engagement", "error", "event.retry", { ...context, attempt, status: error.status, errorCode: error.code });
        if (attempt < 3) { await delay(attempt * 500); await heartbeat(); continue; }
        const failure = { ...projection, sourceTopic: topic, sourcePartition: partition, sourceOffset: message.offset, attempts: attempt, errorCode: error.code, status: error.status, failedAt: new Date().toISOString() };
        await producer.send({ topic: topics.deadLetter, acks: -1, messages: [{ key: String(projection.eventId || "invalid"), value: JSON.stringify(failure) }] });
        log("engagement", "error", "event.dead_letter", { ...context, status: error.status, errorCode: error.code });
        events.inc({ service: "engagement", type: eventType(event.type), stage: "dead_letter", result: "error" });
      }
    }
    // KafkaJS resolves this message only after the handler returns. Its runner
    // also resolves transaction control records that never reach eachMessage.
  } });
  return async () => { health.close(); await consumer.stop(); await consumer.disconnect(); await producer.disconnect(); };
}
