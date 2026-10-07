import { transaction } from "../../../packages/shared/db.ts";
import { CARDS, CONTACTS, INIT_TX, LIMITS } from "../fixtures/demo.ts";
import type { Pool } from "pg";
import { toMinor } from "./accounts.ts";
export async function seed(pool: Pool, userId: string, holder: string) {
  await transaction(pool, async (c) => {
    const inserted = await c.query(
      "INSERT INTO banking.workspaces(user_id) VALUES($1) ON CONFLICT DO NOTHING RETURNING user_id",
      [userId],
    );
    if (!inserted.rowCount) return;
    const rows = INIT_TX.filter(
      (t) => !["t10b", "t48", "t49"].includes(t.id),
    ).map((t) => ({
      ...t,
      amount: t.id === "t16b" ? -800 : t.amount,
      icon: t.id === "t16b" ? "expense" : t.icon,
    }));
    for (const card of CARDS) {
      const acct = "a" + card.id.slice(1);
      const history = rows.filter(
        (t) =>
          t.card.includes(card.num) || (card.id === "k1" && t.card === "acc"),
      );
      const sum = history.reduce((total, t) => total + toMinor(t.amount), 0n);
      await c.query(
        "INSERT INTO banking.accounts(user_id,id,currency,balance_minor,opening_balance_minor) VALUES($1,$2,$3,$4,$5)",
        [
          userId,
          acct,
          card.code,
          toMinor(card.balance).toString(),
          (toMinor(card.balance) - sum).toString(),
        ],
      );
      const number =
        card.id === "k1" ? card.full.slice(0, -4) + card.num : card.full;
      await c.query(
        "INSERT INTO banking.cards(user_id,id,account_id,number,expiry,cvc,holder,tone) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
        [
          userId,
          card.id,
          acct,
          number,
          card.id === "k2" ? "11/29" : card.exp,
          card.cvc,
          holder,
          card.tone,
        ],
      );
    }
    for (const r of CONTACTS)
      await c.query(
        "INSERT INTO banking.recipients(user_id,id,name,account,initial,tone,image) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [userId, r.id, r.name, r.acct, r.initial, r.tone, r.img || null],
      );
    for (const l of LIMITS)
      await c.query(
        "INSERT INTO banking.limits(user_id,id,value) VALUES($1,$2,$3)",
        [userId, l.id, l.def],
      );
    for (const [index, t] of rows.entries()) {
      const card = CARDS.find((c) => t.card.includes(c.num)) || CARDS[0];
      const timestamp = new Date(
        Date.now() - (index + 1) * 7 * 3600000,
      ).toISOString();
      await c.query(
        "INSERT INTO banking.transactions(user_id,id,account_id,card_id,name,category,amount_minor,currency,icon,group_label,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
        [
          userId,
          t.id,
          "a" + card.id.slice(1),
          card.id,
          t.name,
          t.cat,
          toMinor(t.amount).toString(),
          card.code,
          t.icon,
          t.group,
          timestamp,
        ],
      );
    }
  });
}
