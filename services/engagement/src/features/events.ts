import { route, fail } from "../../../../packages/shared/http.ts";
import { transaction } from "../../../../packages/shared/db.ts";
import {
  currencies,
  externalBanks,
} from "../../../../packages/contracts/index.ts";
import type { DomainEvent } from "../../../../packages/contracts/index.ts";
import { Router } from "express";
import type { Pool } from "pg";
import { ensure } from "../wallet.ts";
import { notification } from "../notifications.ts";
import { bankAmount } from "../content/bank-amount.ts";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const operation = /^[A-Za-z0-9_-]{1,100}$/;
function maskedReference(value: string) {
  if (/^\+7 ••• •••-\d{4}$/.test(value) || /^•••• \d{4}$/.test(value))
    return value;
  const last = value.slice(-4);
  return value.startsWith("+") ? "+7 ••• •••-" + last : "•••• " + last;
}
function validReference(value: unknown): value is string {
  return (
    typeof value === "string" &&
    (/^\+7 ••• •••-\d{4}$/.test(value) ||
      /^•••• \d{4}$/.test(value) ||
      /^\+7\d{10}$/.test(value) ||
      /^\d{16,19}$/.test(value))
  );
}
function validEvent(value: unknown): value is DomainEvent {
  if (!value || typeof value !== "object") return false;
  const e = value as Record<string, unknown>;
  if (
    typeof e.id !== "string" ||
    !uuid.test(e.id) ||
    typeof e.userId !== "string" ||
    !uuid.test(e.userId) ||
    !e.payload ||
    typeof e.payload !== "object"
  )
    return false;
  const p = e.payload as Record<string, unknown>;
  if (
    typeof p.amount !== "string" ||
    !/^\d{1,10}(?:\.\d{1,2})?$/.test(p.amount) ||
    Number(p.amount) <= 0 ||
    !currencies.includes(p.currency as (typeof currencies)[number])
  )
    return false;
  if (e.type === "banking.transfer.completed" && e.version === 1)
    return (
      typeof p.transferId === "string" &&
      operation.test(p.transferId) &&
      typeof p.recipient === "string" &&
      p.recipient.length <= 200
    );
  if (e.type === "banking.transfer.completed" && e.version === 2)
    return (
      typeof p.senderUserId === "string" &&
      uuid.test(p.senderUserId) &&
      p.senderUserId === e.userId &&
      typeof p.receiverUserId === "string" &&
      uuid.test(p.receiverUserId) &&
      p.receiverUserId !== p.senderUserId &&
      typeof p.senderOperationId === "string" &&
      operation.test(p.senderOperationId) &&
      typeof p.receiverOperationId === "string" &&
      operation.test(p.receiverOperationId) &&
      p.receiverOperationId !== p.senderOperationId &&
      typeof p.senderName === "string" &&
      p.senderName.length <= 200 &&
      typeof p.receiverName === "string" &&
      p.receiverName.length <= 200
    );
  if (e.type === "banking.external-transfer.completed" && e.version === 1) {
    const bank = externalBanks.find((entry) => entry.id === p.bankId);
    return (
      !!bank &&
      p.bankName === bank.name &&
      typeof p.operationId === "string" &&
      operation.test(p.operationId) &&
      validReference(p.recipientReference)
    );
  }
  if (e.type === "banking.top-up.completed" && e.version === 1)
    return typeof p.operationId === "string" && operation.test(p.operationId);
  return false;
}
export function createEventsRoutes(pool: Pool) {
  const app = Router();
  app.post(
    "/internal/events",
    route(async (req, res) => {
      const e: unknown = req.body;
      if (!validEvent(e)) fail(422, "INVALID_EVENT", "Некорректное событие");
      await transaction(pool, async (c) => {
        const inserted = await c.query(
          "INSERT INTO engagement.inbox(event_id) VALUES($1) ON CONFLICT DO NOTHING RETURNING event_id",
          [e.id],
        );
        if (!inserted.rowCount) return;
        if (e.type === "banking.top-up.completed") {
          await notification(
            c,
            e.userId,
            "top_up",
            "Счёт пополнен",
            "На счёт зачислено " + bankAmount(e.payload.amount, e.payload.currency) + ".",
            "/history/" + e.payload.operationId,
          );
          return;
        }
        await ensure(pool, e.userId, c);
        if (e.type === "banking.external-transfer.completed") {
          await c.query(
            "SELECT user_id FROM engagement.wallets WHERE user_id=$1 FOR UPDATE",
            [e.userId],
          );
          const previous = await c.query(
            "SELECT id FROM engagement.notifications WHERE user_id=$1 AND kind='transfer' AND url=$2 LIMIT 1",
            [e.userId, "/history/" + e.payload.operationId],
          );
          if (previous.rowCount) return;
        }
        await c.query(
          "UPDATE engagement.wallets SET points=points+5 WHERE user_id=$1",
          [e.userId],
        );
        if (e.type === "banking.external-transfer.completed") {
          await notification(
            c,
            e.userId,
            "transfer",
            "Перевод выполнен",
            "Отправлено " + bankAmount(e.payload.amount, e.payload.currency) +
              ". Банк: " + e.payload.bankName + ". " + maskedReference(e.payload.recipientReference) + ".",
            "/history/" + e.payload.operationId,
          );
          return;
        }
        if (e.version === 2) {
          await notification(
            c,
            e.payload.senderUserId,
            "transfer",
            "Перевод выполнен",
            "Отправлено " + bankAmount(e.payload.amount, e.payload.currency) +
              ". Получатель: " + e.payload.receiverName + ".",
            "/history/" + e.payload.senderOperationId,
          );
          await notification(
            c,
            e.payload.receiverUserId,
            "transfer_incoming",
            "Деньги поступили",
            "Зачислено " + bankAmount(e.payload.amount, e.payload.currency) +
              ". Отправитель: " + e.payload.senderName + ".",
            "/history/" + (/\.50$/.test(e.payload.amount) ? e.payload.senderOperationId : e.payload.receiverOperationId),
          );
        } else {
          await notification(
            c,
            e.userId,
            "transfer",
            "Перевод выполнен",
            "Отправлено " + bankAmount(e.payload.amount, e.payload.currency) +
              ". Получатель: " + e.payload.recipient + ".",
            "/history/" + e.payload.transferId,
          );
        }
      });
      res.json({ ok: true });
    }),
  );
  return app;
}
