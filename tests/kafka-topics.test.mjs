import test from "node:test";
import assert from "node:assert/strict";
import { operationTopics, topics } from "../packages/shared/kafka.ts";
import { notificationEvent } from "../services/engagement/src/notification-event.ts";
import { notification } from "../services/engagement/src/notifications.ts";
import { safeLog } from "../packages/shared/telemetry.ts";

test("internal and external transfers share the transfer flow; topups stay separate", () => {
  assert.deepEqual(operationTopics("banking.transfer.completed"), operationTopics("banking.external-transfer.completed"));
  assert.equal(operationTopics("banking.top-up.completed").public, topics.topups);
  assert.notEqual(operationTopics("banking.top-up.completed").internal, operationTopics("banking.transfer.completed").internal);
  assert.throws(() => operationTopics("private-arbitrary-event"), /UNKNOWN_OPERATION_EVENT/);
});

test("notification events identify the persisted result and its cause without its private content", () => {
  const context = { eventId: "75b65963-8916-4d79-a4ae-25424797c33f", requestId: "qa-notification" };
  const event = notificationEvent("a7af854c-06ed-45a4-a651-5ebc63bfeaa3", "private-user", "transfer", "transactions", "/history/tr-safe", context);
  assert.equal(event.causationId, context.eventId);
  assert.equal(event.requestId, context.requestId);
  assert.equal(event.operationId, "tr-safe");
  assert.equal(event.type, "engagement.notification.created");
  assert.notEqual(event.eventId, event.causationId);
  assert.match(event.accountRef, /^[a-f0-9]{12}$/);
  assert.ok(!JSON.stringify(event).includes("private-user"));
  const background = notificationEvent(event.notificationId, "private-user", "offer", "offers", "/cards");
  assert.equal(background.causationId, undefined);
  assert.equal(background.requestId, undefined);
  assert.equal(background.operationId, undefined);
  const log = safeLog({ ...event, service: "engagement", level: "info", message: "event.published" });
  assert.equal(log.causationId, event.causationId);
  assert.equal(log.notificationId, event.notificationId);
});

test("notification and its safe outbox record use the same SQL client; no broker call occurs in their transaction", async () => {
  const previous = process.env.EVENT_TRANSPORT;
  process.env.EVENT_TRANSPORT = "kafka";
  const queries = [];
  const client = { query: async (sql, values) => { queries.push({ sql, values }); return { rowCount: 0 }; } };
  try {
    const result = await notification(client, "private-user", "top_up", "private-title", "private-body", "/history/tu-safe", { requestId: "trace" });
    const saved = queries.find(row => row.sql.includes("notification_outbox"));
    assert.equal(saved.values[1], result.id);
    assert.equal(saved.values[0], saved.values[2].eventId);
    assert.equal(saved.values[2].notificationId, result.id);
    for (const marker of ["private-title", "private-body", "private-user"]) assert.ok(!JSON.stringify(saved.values[2]).includes(marker));
    assert.equal(queries[0].values[0], result.id);
  } finally {
    if (previous === undefined) delete process.env.EVENT_TRANSPORT; else process.env.EVENT_TRANSPORT = previous;
  }
});
