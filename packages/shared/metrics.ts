import { Registry, Counter, Gauge, Histogram, collectDefaultMetrics } from "@prometheus-io/client";

export const registry = new Registry();
collectDefaultMetrics({ register: registry, labels: { service: process.env.SERVICE || "gateway" } });
export const requests = new Counter({ name: "cardo_http_requests_total", help: "Completed HTTP requests", labelNames: ["service", "method", "route", "status"], registers: [registry] });
export const duration = new Histogram({ name: "cardo_http_request_duration_seconds", help: "HTTP response time", labelNames: ["service", "method", "route"], buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10], registers: [registry] });
export const events = new Counter({ name: "cardo_events_total", help: "Event delivery stages", labelNames: ["service", "type", "stage", "result"], registers: [registry] });
export const backlog = new Gauge({ name: "cardo_outbox_pending", help: "Events awaiting broker acknowledgement", labelNames: ["service"], registers: [registry] });
export const lag = new Gauge({ name: "cardo_kafka_consumer_lag", help: "Available retained offset range after committed next offset", labelNames: ["group", "topic", "partition"], registers: [registry] });
export const telemetryDropped = new Counter({ name: "cardo_telemetry_dropped_total", help: "Safe log records dropped because the queue is full", labelNames: ["service"], registers: [registry] });
export const telemetryQueued = new Gauge({ name: "cardo_telemetry_queued", help: "Log records awaiting ingestion", labelNames: ["service"], registers: [registry] });

export function eventType(value: unknown) {
  return ["banking.transfer.completed", "banking.external-transfer.completed", "banking.top-up.completed", "engagement.notification.created"].includes(String(value)) ? String(value) : "unknown";
}
export function routeLabel(value: string) {
  return value.split("?")[0].split("/").map(part => /^[0-9a-f-]{36}$/i.test(part) || /^(?:tu|tr|ex|ca|ac|r)[0-9a-f-]{16,}$/i.test(part) || /^\d+$/.test(part) ? ":id" : part).slice(0, 5).join("/").slice(0, 160);
}

export function publicRouteResolver(paths: string[]) {
  const routes = paths.map(path => ({
    template: path.replace(/\{[^}]+\}/g, ":id"),
    pattern: new RegExp("^" + path.split("/").map(part => /^\{[^}]+\}$/.test(part) ? "[^/]+" : part.replace(/[.*+?^$()|[\]\\]/g, "\\$&")).join("/") + "/?$"),
  }));
  return (url: string) => {
    const path = url.split("?")[0];
    const route = routes.find(item => item.pattern.test(path));
    if (route) return route.template;
    if (path.startsWith("/api/docs")) return "/api/docs";
    if (path.startsWith("/api/")) return "/api/unknown";
    if (path.startsWith("/assets/")) return "/assets/:file";
    return "/page";
  };
}
