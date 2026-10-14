import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { kafkaClient, topics, bankingTopics, practiceTopics } from "../packages/shared/kafka.ts";

const enabled = process.env.CARDO_KAFKA_INTEGRATION === "1";
test("processing a transactional event commits both data and trailing control records", { skip: !enabled, timeout: 90000 }, async () => {
  const base = process.env.CARDO_TEST_BASE_URL || "http://127.0.0.1:8942";
  assert.ok(["127.0.0.1", "localhost", "gateway"].includes(new URL(base).hostname), "Use an isolated local Cardo");
  async function request(path, method = "GET", body, token, status = 200) {
    const response = await fetch(base + path, { method, signal: AbortSignal.timeout(10000), headers: { "Content-Type": "application/json", "Idempotency-Key": randomUUID(), ...(token ? { Authorization: "Bearer " + token } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    assert.equal(response.status, status);
    return response.json();
  }
  const auth = await request("/api/auth/register", "POST", { name: "Проверка Очереди", phone: "+7993" + String(Math.floor(Math.random() * 10000000)).padStart(7, "0"), password: "kafka_test_dev1" }, undefined, 201);
  const cards = await request("/api/cards", "GET", undefined, auth.token);
  const operation = await request("/api/top-ups", "POST", { cardId: cards.find(card => card.code === "RUB").id, amount: "12.00" }, auth.token);
  const admin = kafkaClient("telemetry").admin();
  await admin.connect();
  try {
    let processed = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      const notifications = await request("/api/notifications", "GET", undefined, auth.token);
      if (notifications.some(item => item.url === "/history/" + operation.operationId)) { processed = true; break; }
      await delay(500);
    }
    assert.ok(processed, "Notification is durably stored");
    let caughtUp = false;
    for (let attempt = 0; attempt < 30; attempt++) {
      const checks = [];
      for (const [groupId, topic] of [...bankingTopics.map(topic => ["cardo-engagement", topic]), ...practiceTopics.map(topic => ["cardo-practice-audit", topic])]) {
        const end = await admin.fetchTopicOffsets(topic);
        const saved = await admin.fetchOffsets({ groupId, topics: [topic] });
        checks.push(end.every(partition => partition.high === "0" || saved[0].partitions.find(item => item.partition === partition.partition)?.offset === partition.high));
      }
      if (checks.every(Boolean)) { caughtUp = true; break; }
      await delay(500);
    }
    assert.ok(caughtUp, "No false lag from the transaction's commit marker");
  } finally { await admin.disconnect(); }
});
