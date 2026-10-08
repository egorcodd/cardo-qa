import { randomUUID, createHash } from "node:crypto";
import {
  route,
  context,
  fail,
  HttpError,
} from "../../../../packages/shared/http.ts";
import { transaction } from "../../../../packages/shared/db.ts";
import { minor, decimal } from "../../../../packages/shared/validation.ts";
import type { DomainEvent } from "../../../../packages/contracts/index.ts";
import { Router } from "express";
import type { Pool } from "pg";
import type { CustomerClient } from "../integrations/customer.ts";
import { resolveBank, recipientReference } from "../banks.ts";
import { findExternalRecipient } from "../../fixtures/external-recipients.ts";
import type { MembershipClient } from "../integrations/membership.ts";
import { transferFee } from "../transfer-fees.ts";
export function createTransfersRoutes(
  pool: Pool,
  customer: CustomerClient,
  membership: MembershipClient,
) {
  const app = Router();
  app.get(
    "/api/transfer/fee",
    route(async (req, res) => {
      res.set("Cache-Control", "no-store");
      res.json(
        transferFee(await membership.current(context(req), res.locals.requestId)),
      );
    }),
  );
  app.post(
    "/api/transfer",
    route(async (req, res) => {
      const senderUserId = context(req);
      const amount = minor(req.body.amount);
      const { cardId, recipientId } = req.body;
      const key = req.header("Idempotency-Key") || req.body.idempotencyKey;
      if (typeof key !== "string" || !/^[\w-]{8,80}$/.test(key))
        fail(422, "IDEMPOTENCY_REQUIRED", "Нужен ключ операции");
      if (typeof cardId !== "string" || typeof recipientId !== "string")
        fail(422, "INVALID_TRANSFER", "Выбери карту и получателя");
      const hash = createHash("sha256")
        .update(
          JSON.stringify({ cardId, recipientId, amount: amount.toString() }),
        )
        .digest("hex");
      const saved = (
        await pool.query(
          "SELECT * FROM banking.receipts WHERE user_id=$1 AND key=$2",
          [senderUserId, key],
        )
      ).rows[0];
      if (saved) {
        if (saved.payload_hash !== hash)
          fail(
            409,
            "IDEMPOTENCY_CONFLICT",
            "Ключ уже использован для другой операции",
          );
        return res.json(saved.result);
      }
      const selected = (
        await pool.query(
          "SELECT * FROM banking.recipients WHERE user_id=$1 AND id=$2",
          [senderUserId, recipientId],
        )
      ).rows[0];
      if (!selected) fail(404, "RECIPIENT_NOT_FOUND", "Получатель не найден");
      const bank = resolveBank(selected.bank_id);
      const external = selected.kind === "external" && bank.id !== "cardo";
      if (
        !external &&
        (selected.kind !== "registered" ||
          bank.id !== "cardo" ||
          !selected.target_user_id)
      )
        fail(
          409,
          "OUTDATED_RECIPIENT",
          "Найди получателя по телефону или карте заново",
        );
      if (
        external &&
        (selected.target_user_id ||
          selected.target_account_id ||
          selected.target_card_id)
      )
        fail(
          409,
          "OUTDATED_RECIPIENT",
          "Найди получателя по телефону или карте заново",
        );
      const externalRecipient = external
        ? findExternalRecipient(
            bank.id,
            selected.lookup_type,
            selected.lookup_value,
          )
        : undefined;
      if (external && !externalRecipient)
        fail(404, "RECIPIENT_NOT_FOUND", "Получатель не найден");
      const receiverUserId: string | null = external
        ? null
        : selected.target_user_id;
      if (receiverUserId === senderUserId)
        fail(422, "SELF_TRANSFER", "Нельзя переводить себе");
      let receiver: Awaited<ReturnType<CustomerClient["resolve"]>> | undefined;
      if (receiverUserId) {
        try {
          receiver = await customer.resolve(
            selected.lookup_type === "phone"
              ? { phone: selected.lookup_value }
              : { id: receiverUserId },
            res.locals.requestId,
          );
        } catch (error) {
          if (error instanceof HttpError && error.status === 404)
            fail(
              409,
              "OUTDATED_RECIPIENT",
              "Найди получателя по телефону или карте заново",
            );
          throw error;
        }
        if (receiver.id !== receiverUserId)
          fail(
            409,
            "OUTDATED_RECIPIENT",
            "Найди получателя по телефону или карте заново",
          );
      }
      const senderName = decodeURIComponent(
        req.header("X-User-Name") || "Клиент Cardo",
      );
      const tariff = transferFee(
        await membership.current(senderUserId, res.locals.requestId),
      );
      const fee = BigInt(tariff.feeMinor);
      const totalDebit = amount + fee;
      const result = await transaction(pool, async (c) => {
        const actors = receiverUserId
          ? [senderUserId, receiverUserId]
          : [senderUserId];
        const locked = await c.query(
          "SELECT user_id FROM banking.workspaces WHERE user_id=ANY($1::uuid[]) ORDER BY user_id FOR UPDATE",
          [actors],
        );
        if (locked.rowCount !== actors.length)
          fail(409, "OUTDATED_RECIPIENT", "Счёт получателя недоступен");
        const prior = (
          await c.query(
            "SELECT * FROM banking.receipts WHERE user_id=$1 AND key=$2",
            [senderUserId, key],
          )
        ).rows[0];
        if (prior) {
          if (prior.payload_hash !== hash)
            fail(
              409,
              "IDEMPOTENCY_CONFLICT",
              "Ключ уже использован для другой операции",
            );
          return prior.result;
        }
        const recipient = (
          await c.query(
            "SELECT * FROM banking.recipients WHERE user_id=$1 AND id=$2 FOR UPDATE",
            [senderUserId, recipientId],
          )
        ).rows[0];
        if (
          !recipient ||
          recipient.kind !== selected.kind ||
          recipient.bank_id !== bank.id ||
          recipient.target_user_id !== receiverUserId ||
          recipient.target_account_id !== selected.target_account_id ||
          recipient.target_card_id !== selected.target_card_id ||
          recipient.lookup_type !== selected.lookup_type ||
          recipient.lookup_value !== selected.lookup_value
        )
          fail(
            409,
            "OUTDATED_RECIPIENT",
            "Найди получателя по телефону или карте заново",
          );
        const cards = (
          await c.query(
            "SELECT c.*,a.currency,a.balance_minor FROM banking.cards c JOIN banking.accounts a ON a.user_id=c.user_id AND a.id=c.account_id WHERE (c.user_id=$1 AND c.id=$2) OR (c.user_id=$3 AND c.id=$4) ORDER BY c.user_id,c.id FOR UPDATE OF c,a",
            [senderUserId, cardId, receiverUserId, recipient.target_card_id],
          )
        ).rows;
        const senderCard = cards.find((card) => card.user_id === senderUserId);
        const receiverCard = receiverUserId
          ? cards.find((card) => card.user_id === receiverUserId)
          : null;
        if (!senderCard) fail(404, "CARD_NOT_FOUND", "Карта не найдена");
        if (
          receiverUserId &&
          (!receiverCard ||
            receiverCard.account_id !== recipient.target_account_id)
        )
          fail(
            409,
            "OUTDATED_RECIPIENT",
            "Найди получателя по телефону или карте заново",
          );
        if (
          receiverCard &&
          recipient.lookup_type === "card" &&
          receiverCard.number.replace(/\D/g, "") !== recipient.lookup_value
        )
          fail(
            409,
            "OUTDATED_RECIPIENT",
            "Номер карты получателя изменился. Найди его заново",
          );
        if (senderCard.frozen) fail(409, "CARD_FROZEN", "Карта заморожена");
        if (receiverCard?.frozen)
          fail(409, "RECIPIENT_CARD_FROZEN", "Карта получателя заморожена");
        if (receiverCard && senderCard.currency !== receiverCard.currency)
          fail(422, "CURRENCY_MISMATCH", "Валюты счетов не совпадают");
        if (senderCard.currency !== "RUB")
          fail(422, "UNSUPPORTED_TRANSFER_CURRENCY", "Можно переводить рубли");
        if (BigInt(senderCard.balance_minor) < totalDebit)
          fail(409, "INSUFFICIENT_FUNDS", "Недостаточно денег с учётом комиссии", {
            amount: decimal(amount),
            fee: tariff.fee,
            totalDebit: decimal(totalDebit),
            balance: decimal(BigInt(senderCard.balance_minor)),
            currency: senderCard.currency,
          });
        const limits = (
          await c.query(
            "SELECT id,value FROM banking.limits WHERE user_id=$1",
            [senderUserId],
          )
        ).rows;
        const single =
          BigInt(limits.find((l) => l.id === "single").value) * 100n;
        const daily =
          BigInt(limits.find((l) => l.id === "transfer").value) * 100n;
        const spent = BigInt(
          (
            await c.query(
              "SELECT coalesce(sum(-amount_minor),0)::text total FROM banking.transactions WHERE user_id=$1 AND recipient_id IS NOT NULL AND amount_minor<0 AND currency=$2 AND created_at>=date_trunc('day',now())",
              [senderUserId, senderCard.currency],
            )
          ).rows[0].total,
        );
        if (amount > single || spent + amount > daily)
          fail(409, "LIMIT_EXCEEDED", "Превышен лимит переводов");
        const senderOperationId = "n" + randomUUID();
        const receiverOperationId = receiverUserId ? "n" + randomUUID() : null;
        const balance = BigInt(senderCard.balance_minor) - totalDebit;
        const reference = recipientReference(
          recipient.lookup_type,
          recipient.lookup_value,
        );
        await c.query(
          "UPDATE banking.accounts SET balance_minor=balance_minor+$3 WHERE user_id=$1 AND id=$2",
          [senderUserId, senderCard.account_id, (-totalDebit).toString()],
        );
        if (receiverUserId && receiverCard)
          await c.query(
            "UPDATE banking.accounts SET balance_minor=balance_minor+$3 WHERE user_id=$1 AND id=$2",
            [receiverUserId, receiverCard.account_id, amount.toString()],
          );
        const entries = [
          {
            userId: senderUserId,
            id: senderOperationId,
            card: senderCard,
            name: receiver?.name || externalRecipient?.name || recipient.name,
            delta: -amount,
            icon: "send",
            counterparty: receiverUserId,
            counterpartId: receiverOperationId,
            recipientId: recipientId as string | null,
            reference,
            fee,
            plan: tariff.plan as string | null,
          },
        ];
        if (receiverUserId && receiverCard && receiverOperationId)
          entries.push({
            userId: receiverUserId,
            id: receiverOperationId,
            card: receiverCard,
            name: senderName,
            delta: amount,
            icon: "income",
            counterparty: senderUserId,
            counterpartId: senderOperationId,
            recipientId: null,
            reference: recipientReference("card", senderCard.number),
            fee: 0n,
            plan: null,
          });
        for (const entry of entries)
          await c.query(
            "INSERT INTO banking.transactions(user_id,id,account_id,card_id,name,category,amount_minor,currency,icon,group_label,recipient_id,transfer_id,counterparty_user_id,counterpart_operation_id,bank_id,bank_name,recipient_reference,transfer_kind,fee_minor,transfer_plan) VALUES($1,$2,$3,$4,$5,'c.transfer',$6,$7,$8,'g.today',$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)",
            [
              entry.userId,
              entry.id,
              entry.card.account_id,
              entry.card.id,
              entry.name,
              entry.delta.toString(),
              senderCard.currency,
              entry.icon,
              entry.recipientId,
              senderOperationId,
              entry.counterparty,
              entry.counterpartId,
              bank.id,
              bank.name,
              entry.reference,
              external ? "external" : "internal",
              entry.fee.toString(),
              entry.plan,
            ],
          );
        const feeOperationId = "n" + randomUUID();
        await c.query(
          "INSERT INTO banking.transactions(user_id,id,account_id,card_id,name,category,amount_minor,currency,icon,group_label,transfer_id,bank_id,bank_name,transfer_kind) VALUES($1,$2,$3,$4,'Комиссия за перевод','c.fee',$5,'RUB','expense','g.today',$6,'cardo','Cardo','internal')",
          [
            senderUserId,
            feeOperationId,
            senderCard.account_id,
            senderCard.id,
            (-fee).toString(),
            senderOperationId,
          ],
        );
        const receipt = {
          ok: true,
          transferId: senderOperationId,
          senderOperationId,
          ...(receiverOperationId ? { receiverOperationId } : {}),
          feeOperationId,
          status: "completed",
          amount: decimal(amount),
          fee: tariff.fee,
          feeMinor: tariff.feeMinor,
          totalDebit: decimal(totalDebit),
          totalDebitMinor: totalDebit.toString(),
          plan: tariff.plan,
          balance: decimal(balance),
          currency: senderCard.currency,
          bankId: bank.id,
          bankName: bank.name,
          recipientReference: reference,
          transferKind: external ? "external" : "internal",
        };
        await c.query(
          "INSERT INTO banking.receipts(user_id,key,payload_hash,result) VALUES($1,$2,$3,$4)",
          [senderUserId, key, hash, receipt],
        );
        const base = {
          id: randomUUID(),
          userId: senderUserId,
          requestId: res.locals.requestId,
          occurredAt: new Date().toISOString(),
        };
        let event: DomainEvent;
        if (external) {
          event = {
            ...base,
            type: "banking.external-transfer.completed",
            version: 1,
            payload: {
              operationId: senderOperationId,
              amount: decimal(amount),
              currency: "RUB",
              bankId: bank.id,
              bankName: bank.name,
              recipientReference: reference,
            },
          };
        } else {
          if (!receiver || !receiverUserId || !receiverOperationId)
            fail(409, "OUTDATED_RECIPIENT", "Счёт получателя недоступен");
          event = {
            ...base,
            type: "banking.transfer.completed",
            version: 2,
            payload: {
              transferId: senderOperationId,
              senderUserId,
              receiverUserId,
              senderOperationId,
              receiverOperationId,
              amount: decimal(amount),
              currency: senderCard.currency,
              senderName,
              receiverName: receiver.name,
            },
          };
        }
        await c.query(
          "INSERT INTO banking.outbox(id,user_id,payload) VALUES($1,$2,$3)",
          [event.id, senderUserId, event],
        );
        return receipt;
      });
      res.json(result);
    }),
  );
  return app;
}
