import { createHash, randomUUID } from "node:crypto";

export type NotificationContext = { eventId?: string; requestId?: string };
export function notificationEvent(id: string, user: string, kind: string, category: string, url: string, context: NotificationContext = {}) {
  const history = /^\/history\/([A-Za-z0-9_-]{1,100})$/.exec(url);
  return {
    eventId: randomUUID(), type: "engagement.notification.created", version: 1,
    occurredAt: new Date().toISOString(), notificationId: id,
    accountRef: createHash("sha256").update(user).digest("hex").slice(0, 12),
    kind: /^[a-z_]{1,40}$/.test(kind) ? kind : "other",
    category: ["transactions", "service", "offers"].includes(category) ? category : "service",
    ...(history ? { operationId: history[1] } : {}),
    ...(context.eventId && /^[0-9a-f-]{36}$/i.test(context.eventId) ? { causationId: context.eventId } : {}),
    ...(context.requestId && /^[A-Za-z0-9_.:-]{1,120}$/.test(context.requestId) ? { requestId: context.requestId } : {}),
  };
}
