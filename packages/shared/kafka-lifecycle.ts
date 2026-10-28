import type { Consumer } from "kafkajs";
import { Gauge } from "@prometheus-io/client";
import { registry } from "./metrics.ts";
import { log } from "./telemetry.ts";

const readyMetric = new Gauge({ name: "cardo_kafka_consumer_ready", help: "Consumer joined and heartbeating", labelNames: ["service", "group"], registers: [registry] });
const watchers = new Set<() => boolean>();
let terminating = false;
export function kafkaErrorCode(error: unknown): string {
  const item = error as { type?: string; name?: string; cause?: unknown } | undefined;
  const code = item?.type || (item?.cause ? kafkaErrorCode(item.cause) : item?.name) || "KAFKA_UNKNOWN";
  return /^[A-Za-z0-9_]{1,100}$/.test(code) ? code : "KAFKA_UNKNOWN";
}
export function fatalKafka() {
  if (terminating) return;
  terminating = true;
  process.exitCode = 1;
  setTimeout(() => process.exit(1), 10000).unref();
  if (process.listenerCount("SIGTERM")) process.emit("SIGTERM");
  else process.exit(1);
}
export function kafkaReady() { return [...watchers].every(check => check()); }
export function watchConsumer(consumer: Consumer, service: string, group: string, fatal = fatalKafka, now = Date.now) {
  let closing = false, failed = false, joined = false, lastSignal = now();
  const labels = { service, group };
  const ready = () => !closing && !failed && joined && now() - lastSignal < 60000;
  const update = () => readyMetric.set(labels, ready() ? 1 : 0);
  const stop = (code: string) => {
    if (closing || failed) return;
    failed = true;
    update();
    log(service, "error", "kafka.lifecycle", { group, errorCode: code });
    fatal();
  };
  const removers = [
    consumer.on(consumer.events.GROUP_JOIN, () => { joined = true; lastSignal = now(); update(); log(service, "info", "kafka.lifecycle", { group, errorCode: "GROUP_JOIN" }); }),
    consumer.on(consumer.events.HEARTBEAT, () => { lastSignal = now(); update(); }),
    consumer.on(consumer.events.REBALANCING, () => { joined = false; update(); }),
    consumer.on(consumer.events.CRASH, event => {
      if (closing) return;
      joined = false; update();
      log(service, "error", "kafka.lifecycle", { group, errorCode: kafkaErrorCode(event.payload.error) });
      if (!event.payload.restart) stop("CONSUMER_TERMINATED");
    }),
    consumer.on(consumer.events.STOP, () => { joined = false; update(); }),
    consumer.on(consumer.events.DISCONNECT, () => { joined = false; update(); }),
  ];
  const check = () => { update(); if (!closing && now() - lastSignal >= 60000) stop("CONSUMER_STALLED"); };
  const timer = setInterval(check, 5000);
  timer.unref();
  watchers.add(ready);
  update();
  return { ready, check, close() { closing = true; clearInterval(timer); for (const remove of removers) if (typeof remove === "function") remove(); watchers.delete(ready); update(); } };
}
export function producerRecovery(service: string, fatal = fatalKafka) {
  let failures = 0;
  return {
    success() { failures = 0; },
    failure(error: unknown) {
      const code = kafkaErrorCode(error);
      log(service, "error", "kafka.lifecycle", { errorCode: code, attempt: ++failures });
      if (/FENCED|INVALID_PRODUCER|OUT_OF_ORDER|TRANSACTIONAL_ID_AUTHORIZATION|NON_RETRIABLE/i.test(code) || failures >= 6) fatal();
    },
  };
}
export function offsetRange(low: string, high: string, committed: string) {
  const start = BigInt(low), end = BigInt(high), offset = BigInt(committed);
  const uncommitted = offset < 0n;
  const position = uncommitted || offset < start ? start : offset;
  return { lag: Math.max(0, Number(end - position)), gap: uncommitted ? 0 : Math.max(0, Number(start - offset)), uncommitted };
}
