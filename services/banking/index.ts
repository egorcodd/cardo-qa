import { randomUUID, randomInt, createHash } from "node:crypto";
import {
  service,
  route,
  internal,
  context,
  errors,
  fail,
  listen,
  upstream,
} from "../../packages/shared/http.ts";
import { database, transaction, migrate } from "../../packages/shared/db.ts";
import { minor, decimal } from "../../packages/shared/validation.ts";
import { CARDS, CONTACTS, INIT_TX, LIMITS } from "./demo.ts";
import type { DomainEvent } from "../../packages/contracts/index.ts";
const pool = database("banking");
await migrate(pool, new URL("./migration.sql", import.meta.url));
const app = service("banking");
app.get(
  "/health",
  route(async (_req, res) => {
    await pool.query("SELECT 1");
    res.json({ status: "ok", service: "banking" });
  }),
);
app.use(internal);
const symbols: Record<string, string> = { RUB: "₽", USD: "$", EUR: "€" };
const toMinor = (n: number) => BigInt(Math.round(n * 100));
const cardDTO = (c: Record<string, any>) => ({
  id: c.id,
  num: c.number.replace(/ /g, "").slice(-4),
  holder: c.holder,
  balance: Number(c.balance_minor) / 100,
  balanceMinor: String(c.balance_minor),
  cur: symbols[c.currency],
  code: c.currency,
  tone: c.tone,
  frozen: c.frozen,
});
async function seed(userId: string, holder: string) {
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
app.use("/api", (req, _res, next) => {
  Promise.resolve()
    .then(() =>
      seed(
        context(req),
        decodeURIComponent(req.header("X-User-Name") || "Клиент Cardo"),
      ),
    )
    .then(() => next())
    .catch(next);
});
app.get(
  "/api/cards",
  route(async (req, res) => {
    const rows = (
      await pool.query(
        "SELECT c.*,a.currency,a.balance_minor FROM banking.cards c JOIN banking.accounts a ON a.user_id=c.user_id AND a.id=c.account_id WHERE c.user_id=$1 ORDER BY c.created_at,c.id",
        [context(req)],
      )
    ).rows;
    res.json(rows.map(cardDTO));
  }),
);
app.post(
  "/api/cards",
  route(async (req, res) => {
    const u = context(req);
    const currency = req.body.currency || "RUB";
    const tone = req.body.tone || "lime";
    if (
      !Object.keys(symbols).includes(currency) ||
      !["lime", "dark", "light"].includes(tone)
    )
      fail(422, "INVALID_CARD", "Выбери валюту и оформление");
    const result = await transaction(pool, async (c) => {
      await c.query(
        "SELECT user_id FROM banking.workspaces WHERE user_id=$1 FOR UPDATE",
        [u],
      );
      const count = Number(
        (
          await c.query("SELECT count(*) FROM banking.cards WHERE user_id=$1", [
            u,
          ])
        ).rows[0].count,
      );
      if (count >= 10) fail(409, "CARD_LIMIT", "Можно выпустить до 10 карт");
      const account = (
        await c.query(
          "SELECT * FROM banking.accounts WHERE user_id=$1 AND currency=$2",
          [u, currency],
        )
      ).rows[0];
      const id = "k" + randomUUID();
      const digits =
        "9999 " +
        String(randomInt(1000, 10000)) +
        " " +
        String(randomInt(1000, 10000)) +
        " " +
        String(randomInt(1000, 10000));
      const exp = new Date();
      exp.setFullYear(exp.getFullYear() + 3);
      const row = (
        await c.query(
          "INSERT INTO banking.cards(user_id,id,account_id,number,expiry,cvc,holder,tone) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",
          [
            u,
            id,
            account.id,
            digits,
            String(exp.getMonth() + 1).padStart(2, "0") +
              "/" +
              String(exp.getFullYear()).slice(-2),
            String(randomInt(100, 1000)),
            decodeURIComponent(req.header("X-User-Name") || "Клиент Cardo"),
            tone,
          ],
        )
      ).rows[0];
      return cardDTO({
        ...row,
        ...{ currency, balance_minor: account.balance_minor },
      });
    });
    res.status(201).json(result);
  }),
);
app.get(
  "/api/cards/:id/requisites",
  route(async (req, res) => {
    const c = (
      await pool.query(
        "SELECT c.*,a.currency FROM banking.cards c JOIN banking.accounts a ON a.user_id=c.user_id AND a.id=c.account_id WHERE c.user_id=$1 AND c.id=$2",
        [context(req), req.params.id],
      )
    ).rows[0];
    if (!c) fail(404, "CARD_NOT_FOUND", "Карта не найдена");
    res.json({
      number: c.number,
      exp: c.expiry,
      cvc: c.cvc,
      holder: c.holder,
      account:
        "40817 " +
        c.currency +
        " " +
        c.account_id +
        " " +
        c.user_id.replace(/-/g, "").slice(0, 12),
    });
  }),
);
app.post(
  "/api/cards/:id/freeze",
  route(async (req, res) => {
    if (req.body.frozen !== undefined && typeof req.body.frozen !== "boolean")
      fail(422, "INVALID_STATE", "Некорректное состояние карты");
    const c = (
      await pool.query(
        "UPDATE banking.cards SET frozen=coalesce($3,NOT frozen) WHERE user_id=$1 AND id=$2 RETURNING *",
        [context(req), req.params.id, req.body.frozen ?? null],
      )
    ).rows[0];
    if (!c) fail(404, "CARD_NOT_FOUND", "Карта не найдена");
    res.json({ id: c.id, frozen: c.frozen });
  }),
);
app.get(
  "/api/contacts",
  route(async (req, res) => {
    const rows = (
      await pool.query(
        "SELECT * FROM banking.recipients WHERE user_id=$1 ORDER BY id",
        [context(req)],
      )
    ).rows;
    res.json(
      rows.map((r) => ({
        id: r.id,
        name: r.name,
        acct: r.account,
        initial: r.initial,
        tone: r.tone,
        img: r.image,
      })),
    );
  }),
);
app.get(
  "/api/transactions",
  route(async (req, res) => {
    const limit = req.query.limit === undefined ? 100 : Number(req.query.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100)
      fail(422, "INVALID_LIMIT", "Лимит от 1 до 100");
    const currency = req.query.currency ? String(req.query.currency) : null;
    if (currency && !symbols[currency])
      fail(422, "INVALID_CURRENCY", "Неизвестная валюта");
    const rows = (
      await pool.query(
        "SELECT t.*,c.number FROM banking.transactions t LEFT JOIN banking.cards c ON c.user_id=t.user_id AND c.id=t.card_id WHERE t.user_id=$1 AND ($2::text IS NULL OR t.currency=$2) ORDER BY t.created_at DESC LIMIT $3",
        [context(req), currency, limit],
      )
    ).rows;
    res.json(
      rows.map((t) => ({
        id: t.id,
        name: t.name,
        cat: t.category,
        amount: Number(t.amount_minor) / 100,
        amountMinor: String(t.amount_minor),
        cur: symbols[t.currency],
        code: t.currency,
        icon: t.icon,
        group: t.group_label,
        card:
          "•• " +
          String(t.number || "")
            .replace(/ /g, "")
            .slice(-4),
        status: t.status,
        createdAt: t.created_at,
      })),
    );
  }),
);
app.get(
  "/api/limits",
  route(async (req, res) => {
    const values = (
      await pool.query("SELECT id,value FROM banking.limits WHERE user_id=$1", [
        context(req),
      ])
    ).rows;
    res.json(
      LIMITS.map((l) => ({
        ...l,
        value: Number(values.find((v) => v.id === l.id)?.value ?? l.def),
      })),
    );
  }),
);
app.put(
  "/api/limits",
  route(async (req, res) => {
    const updates = Object.entries(req.body);
    if (!updates.length) fail(422, "INVALID_LIMITS", "Укажи лимиты");
    for (const [id, value] of updates) {
      const l = LIMITS.find((l) => l.id === id);
      if (
        !l ||
        typeof value !== "number" ||
        !Number.isInteger(value) ||
        value < l.min ||
        value > l.max
      )
        fail(422, "INVALID_LIMIT", "Лимит вне допустимого диапазона");
    }
    await transaction(pool, async (c) => {
      await c.query(
        "SELECT user_id FROM banking.workspaces WHERE user_id=$1 FOR UPDATE",
        [context(req)],
      );
      for (const [id, value] of updates)
        await c.query(
          "UPDATE banking.limits SET value=$3 WHERE user_id=$1 AND id=$2",
          [context(req), id, value],
        );
    });
    res.json({ ok: true });
  }),
);
app.get("/api/rates", (_req, res) =>
  res.json({
    base: "RUB",
    rates: { USD: 92.5, EUR: 99.1, KZT: 0.19 },
    asOf: "fixture",
  }),
);
app.post(
  "/api/transfer",
  route(async (req, res) => {
    const u = context(req);
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
    const result = await transaction(pool, async (c) => {
      await c.query(
        "SELECT user_id FROM banking.workspaces WHERE user_id=$1 FOR UPDATE",
        [u],
      );
      const prior = (
        await c.query(
          "SELECT * FROM banking.receipts WHERE user_id=$1 AND key=$2",
          [u, key],
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
      const card = (
        await c.query(
          "SELECT c.*,a.currency,a.balance_minor FROM banking.cards c JOIN banking.accounts a ON a.user_id=c.user_id AND a.id=c.account_id WHERE c.user_id=$1 AND c.id=$2 FOR UPDATE OF c,a",
          [u, cardId],
        )
      ).rows[0];
      const recipient = (
        await c.query(
          "SELECT * FROM banking.recipients WHERE user_id=$1 AND id=$2",
          [u, recipientId],
        )
      ).rows[0];
      if (!card || !recipient)
        fail(404, "NOT_FOUND", "Карта или получатель не найдены");
      if (card.frozen) fail(409, "CARD_FROZEN", "Карта заморожена");
      if (BigInt(card.balance_minor) < amount)
        fail(409, "INSUFFICIENT_FUNDS", "Недостаточно денег");
      const limits = (
        await c.query("SELECT id,value FROM banking.limits WHERE user_id=$1", [
          u,
        ])
      ).rows;
      const single = BigInt(limits.find((l) => l.id === "single").value) * 100n;
      const daily =
        BigInt(limits.find((l) => l.id === "transfer").value) * 100n;
      const spent = BigInt(
        (
          await c.query(
            "SELECT coalesce(sum(-amount_minor),0)::text total FROM banking.transactions WHERE user_id=$1 AND recipient_id IS NOT NULL AND currency=$2 AND created_at>=date_trunc('day',now())",
            [u, card.currency],
          )
        ).rows[0].total,
      );
      if (amount > single || spent + amount > daily)
        fail(409, "LIMIT_EXCEEDED", "Превышен лимит переводов");
      const id = "n" + randomUUID(),
        balance = BigInt(card.balance_minor) - amount;
      await c.query(
        "UPDATE banking.accounts SET balance_minor=$3 WHERE user_id=$1 AND id=$2",
        [u, card.account_id, balance.toString()],
      );
      await c.query(
        "INSERT INTO banking.transactions(user_id,id,account_id,card_id,name,category,amount_minor,currency,icon,group_label,recipient_id) VALUES($1,$2,$3,$4,$5,'c.transfer',$6,$7,'send','g.today',$8)",
        [
          u,
          id,
          card.account_id,
          cardId,
          recipient.name,
          (-amount).toString(),
          card.currency,
          recipientId,
        ],
      );
      const receipt = {
        ok: true,
        transferId: id,
        status: "completed",
        amount: decimal(amount),
        balance: decimal(balance),
        currency: card.currency,
      };
      await c.query(
        "INSERT INTO banking.receipts(user_id,key,payload_hash,result) VALUES($1,$2,$3,$4)",
        [u, key, hash, receipt],
      );
      const event: DomainEvent = {
        id: randomUUID(),
        type: "banking.transfer.completed",
        version: 1,
        userId: u,
        requestId: res.locals.requestId,
        occurredAt: new Date().toISOString(),
        payload: {
          transferId: id,
          amount: decimal(amount),
          currency: card.currency,
          recipient: recipient.name,
        },
      };
      await c.query(
        "INSERT INTO banking.outbox(id,user_id,payload) VALUES($1,$2,$3)",
        [event.id, u, event],
      );
      return receipt;
    });
    res.json(result);
  }),
);
const engagement = process.env.ENGAGEMENT_URL || "http://127.0.0.1:8083";
let delivering = false;
async function dispatch() {
  if (delivering) return;
  delivering = true;
  try {
    const rows = (
      await pool.query(
        "UPDATE banking.outbox SET next_attempt_at=now()+interval '30 seconds',attempts=attempts+1 WHERE id IN (SELECT id FROM banking.outbox WHERE delivered_at IS NULL AND next_attempt_at<=now() ORDER BY created_at LIMIT 10 FOR UPDATE SKIP LOCKED) RETURNING *",
      )
    ).rows;
    for (const row of rows) {
      try {
        const response = await upstream(
          engagement + "/internal/events",
          { method: "POST", body: JSON.stringify(row.payload) },
          row.payload.requestId,
        );
        if (!response.ok) throw new Error("HTTP " + response.status);
        await pool.query(
          "UPDATE banking.outbox SET delivered_at=now(),last_error=NULL WHERE id=$1",
          [row.id],
        );
      } catch (e) {
        await pool.query(
          "UPDATE banking.outbox SET last_error=$2,next_attempt_at=now()+make_interval(secs=>$3) WHERE id=$1",
          [
            row.id,
            (e as Error).message,
            Math.min(300, 2 ** Math.min(row.attempts, 8)),
          ],
        );
      }
    }
  } catch (e) {
    console.error(
      JSON.stringify({
        level: "error",
        service: "banking",
        message: (e as Error).message,
      }),
    );
  } finally {
    delivering = false;
  }
}
setInterval(dispatch, 1000).unref();
errors(app);
listen(app, Number(process.env.PORT || 8082));
