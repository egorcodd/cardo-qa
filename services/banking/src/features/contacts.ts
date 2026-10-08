import { createHash } from "node:crypto";
import {
  route,
  context,
  fail,
  HttpError,
} from "../../../../packages/shared/http.ts";
import { phone } from "../../../../packages/shared/validation.ts";
import { transaction } from "../../../../packages/shared/db.ts";
import { Router } from "express";
import type { Pool } from "pg";
import type { CustomerClient } from "../integrations/customer.ts";
import { seed } from "../workspace.ts";
import { resolveBank } from "../banks.ts";
import {
  externalRecipients,
  findExternalRecipient,
} from "../../fixtures/external-recipients.ts";
import { shortRecipientName } from "../recipient-name.ts";
export const recipientDTO = (r: Record<string, any>) => ({
  id: r.id,
  name: shortRecipientName(
    r.kind === "external"
      ? findExternalRecipient(r.bank_id, r.lookup_type, r.lookup_value)?.name ||
          r.name
      : r.name,
  ),
  acct: r.account,
  initial:
    [
      ...(r.kind === "external"
        ? findExternalRecipient(r.bank_id, r.lookup_type, r.lookup_value)
            ?.name || r.name
        : r.name),
    ][0] || r.initial,
  tone: r.tone,
  ...(r.image ? { img: r.image } : {}),
  targetUserId: r.target_user_id,
  currency: r.currency,
  kind: r.kind,
  bankId: r.bank_id || "cardo",
  bankName: resolveBank(r.bank_id || "cardo").name,
  lookupType: r.lookup_type,
  reference: r.lookup_value,
  lookupValue: r.lookup_value,
});
export function normalizeCard(value: unknown) {
  if (typeof value !== "string" || !/^[\d -]+$/.test(value))
    fail(422, "INVALID_CARD_NUMBER", "Введи 16 цифр номера карты");
  const digits = value.replace(/\D/g, "");
  if (!/^\d{16}$/.test(digits))
    fail(422, "INVALID_CARD_NUMBER", "Введи 16 цифр номера карты");
  return digits;
}
export function createContactsRoutes(pool: Pool, customer: CustomerClient) {
  const app = Router();
  app.get(
    "/api/recipients/examples",
    route(async (req, res) => {
      const bank = resolveBank(req.query.bankId);
      res.json(
        externalRecipients
          .filter((recipient) => recipient.bankId === bank.id)
          .map((recipient) => ({
            ...recipient,
            name: shortRecipientName(recipient.name),
          })),
      );
    }),
  );
  app.get(
    "/api/contacts",
    route(async (req, res) => {
      const rows = (
        await pool.query(
          "SELECT r.*,coalesce(a.currency,'RUB') currency FROM banking.recipients r LEFT JOIN banking.accounts a ON a.user_id=r.target_user_id AND a.id=r.target_account_id WHERE r.user_id=$1 AND r.kind IN ('registered','external') ORDER BY r.name,r.id",
          [context(req)],
        )
      ).rows;
      res.json(
        rows
          .filter(
            (row) =>
              row.kind !== "external" ||
              findExternalRecipient(
                row.bank_id,
                row.lookup_type,
                row.lookup_value,
              ),
          )
          .map(recipientDTO),
      );
    }),
  );
  app.post(
    "/api/recipients/resolve",
    route(async (req, res) => {
      const userId = context(req);
      const bank = resolveBank(req.body.bankId);
      const hasPhone = req.body.phone !== undefined;
      const hasCard = req.body.cardNumber !== undefined;
      if (hasPhone === hasCard)
        fail(422, "INVALID_RECIPIENT", "Укажи телефон или номер карты");
      const lookupType = hasPhone ? "phone" : "card";
      const lookupValue = hasPhone
        ? phone(req.body.phone)
        : normalizeCard(req.body.cardNumber);
      const nextId =
        "r" +
        createHash("sha256")
          .update(bank.id + ":" + lookupType + ":" + lookupValue)
          .digest("hex")
          .slice(0, 32);
      if (bank.id !== "cardo") {
        const example = findExternalRecipient(bank.id, lookupType, lookupValue);
        if (!example) fail(404, "RECIPIENT_NOT_FOUND", "Получатель не найден");
        const recipient = await transaction(pool, async (c) => {
          await c.query(
            "SELECT user_id FROM banking.workspaces WHERE user_id=$1 FOR UPDATE",
            [userId],
          );
          const displayName = example.name;
          const row = (
            await c.query(
              "INSERT INTO banking.recipients(user_id,id,name,account,initial,tone,kind,lookup_type,lookup_value,bank_id) VALUES($1,$2,$3,$4,$5,'dark','external',$6,$4,$7) ON CONFLICT(user_id,id) DO UPDATE SET name=excluded.name,account=excluded.account,initial=excluded.initial,lookup_type=excluded.lookup_type,lookup_value=excluded.lookup_value,bank_id=excluded.bank_id RETURNING *",
              [
                userId,
                nextId,
                displayName,
                lookupValue,
                [...example.name][0],
                lookupType,
                bank.id,
              ],
            )
          ).rows[0];
          return recipientDTO({ ...row, currency: "RUB" });
        });
        return res.json(recipient);
      }
      let targetUserId: string;
      if (hasPhone) {
        let resolved;
        try {
          resolved = await customer.resolve(
            { phone: lookupValue },
            res.locals.requestId,
          );
        } catch (error) {
          if (error instanceof HttpError && error.status === 404)
            fail(404, "RECIPIENT_NOT_FOUND", "Получатель не найден");
          throw error;
        }
        targetUserId = resolved.id;
        if (targetUserId === userId)
          fail(422, "SELF_TRANSFER", "Нельзя переводить себе");
        await seed(pool, resolved.id, resolved.name);
      } else {
        const card = (
          await pool.query(
            "SELECT user_id FROM banking.cards WHERE regexp_replace(number,'[^0-9]','','g')=$1",
            [lookupValue],
          )
        ).rows[0];
        if (!card) fail(404, "RECIPIENT_NOT_FOUND", "Получатель не найден");
        targetUserId = card.user_id;
        if (targetUserId === userId)
          fail(422, "SELF_TRANSFER", "Нельзя переводить себе");
      }
      let resolved;
      try {
        resolved = await customer.resolve(
          { id: targetUserId },
          res.locals.requestId,
        );
      } catch (error) {
        if (error instanceof HttpError && error.status === 404)
          fail(404, "RECIPIENT_NOT_FOUND", "Получатель не найден");
        throw error;
      }
      const recipient = await transaction(pool, async (c) => {
        await c.query(
          "SELECT user_id FROM banking.workspaces WHERE user_id=ANY($1::uuid[]) ORDER BY user_id FOR UPDATE",
          [[userId, targetUserId]],
        );
        const card = (
          await c.query(
            "SELECT c.*,a.currency FROM banking.cards c JOIN banking.accounts a ON a.user_id=c.user_id AND a.id=c.account_id WHERE c.user_id=$1 AND (($2='phone' AND a.currency='RUB') OR ($2='card' AND regexp_replace(c.number,'[^0-9]','','g')=$3)) ORDER BY c.frozen,c.created_at,c.id LIMIT 1 FOR UPDATE OF c,a",
            [targetUserId, lookupType, lookupValue],
          )
        ).rows[0];
        if (!card) fail(404, "RECIPIENT_NOT_FOUND", "Получатель не найден");
        if (card.frozen)
          fail(409, "RECIPIENT_CARD_FROZEN", "Карта получателя заморожена");
        const previous = (
          await c.query(
            "SELECT id FROM banking.recipients WHERE user_id=$1 AND bank_id='cardo' AND kind='registered' AND lookup_type=$2 AND lookup_value=$3 ORDER BY id LIMIT 1",
            [userId, lookupType, lookupValue],
          )
        ).rows[0];
        const id = previous?.id || nextId;
        const acct = hasPhone ? resolved.phone : card.number;
        const row = (
          await c.query(
            "INSERT INTO banking.recipients(user_id,id,name,account,initial,tone,target_user_id,target_account_id,target_card_id,kind,lookup_type,lookup_value,bank_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'registered',$10,$11,'cardo') ON CONFLICT(user_id,id) DO UPDATE SET name=excluded.name,account=excluded.account,initial=excluded.initial,tone=excluded.tone,target_user_id=excluded.target_user_id,target_account_id=excluded.target_account_id,target_card_id=excluded.target_card_id,kind=excluded.kind,lookup_type=excluded.lookup_type,lookup_value=excluded.lookup_value,bank_id=excluded.bank_id RETURNING *",
            [
              userId,
              id,
              resolved.name,
              acct,
              [...resolved.name][0] || "К",
              card.tone,
              targetUserId,
              card.account_id,
              card.id,
              lookupType,
              lookupValue,
            ],
          )
        ).rows[0];
        return recipientDTO({ ...row, currency: card.currency });
      });
      res.json(recipient);
    }),
  );
  return app;
}
