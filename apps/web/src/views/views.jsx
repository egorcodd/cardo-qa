import { useState, useEffect, useRef } from "react";
import Icon from "../icons.jsx";
import { fmt, money } from "../data.js";
import { Bcard } from "../components/Overlays.jsx";
import { useLang } from "../i18n.jsx";
import { api } from "../api.js";

function RatesCard() {
  const { t } = useLang();
  const [rates, setRates] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    api
      .rates()
      .then(setRates)
      .catch((e) => setErr(e.message));
  }, []);
  return (
    <section className="card-soft">
      <div className="soft-head">
        <span>{t("rates.title")}</span>
      </div>
      {err && <div className="load-state load-err">{err}</div>}
      {!err && !rates && (
        <div className="load-state">
          <span className="spinner" />
          {t("common.loading")}
        </div>
      )}
      {rates &&
        Object.entries(rates.rates)
          .filter(([currency]) => ["USD", "EUR"].includes(currency))
          .map(([currency, rate]) => (
            <div className="rate-row" key={currency}>
              <span>{currency}</span>
              <strong>{money(rate)}</strong>
            </div>
          ))}
    </section>
  );
}

function txAmount(a, cur = "₽") {
  const v = Number.isInteger(a) ? fmt(Math.abs(a), 0) : fmt(Math.abs(a), 2);
  return (a > 0 ? "+" : "−") + v + " " + cur;
}

function ScrollRow({ children }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e) => {
      const d = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      if (d && el.scrollWidth > el.clientWidth) {
        el.scrollLeft += d;
        e.preventDefault();
      }
    };
    let down = false,
      sx = 0,
      sl = 0,
      moved = false;
    const md = (e) => {
      down = true;
      moved = false;
      sx = e.pageX;
      sl = el.scrollLeft;
    };
    const mm = (e) => {
      if (!down) return;
      const dx = e.pageX - sx;
      if (Math.abs(dx) > 3) moved = true;
      el.scrollLeft = sl - dx;
    };
    const up = () => {
      down = false;
    };
    const clickGuard = (e) => {
      if (moved) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("pointerdown", md);
    window.addEventListener("pointermove", mm);
    window.addEventListener("pointerup", up);
    el.addEventListener("click", clickGuard, true);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("pointerdown", md);
      window.removeEventListener("pointermove", mm);
      window.removeEventListener("pointerup", up);
      el.removeEventListener("click", clickGuard, true);
    };
  }, []);
  return (
    <div className="people-scroll" ref={ref}>
      {children}
    </div>
  );
}

function Avatar({ c }) {
  if (c.empty) return <span className="ava ava-empty" />;
  return (
    <span
      className={"ava tone-" + c.tone}
      style={c.img ? { backgroundImage: `url(${c.img})` } : undefined}
    >
      {c.img ? "" : c.initial}
    </span>
  );
}

function OpRow({ t: tx, style, onClick }) {
  const { t } = useLang();
  return (
    <button className="op" style={style} onClick={onClick}>
      <span className="op-ico">
        <Icon name={tx.icon} size={18} />
      </span>
      <div className="op-m">
        <div className="op-nm">{t(tx.name)}</div>
        <div className="op-cat">{t(tx.cat)}</div>
      </div>
      <div className="op-right">
        <div className={"op-sum " + (tx.amount > 0 ? "pos" : "neg")}>
          {txAmount(tx.amount, tx.cur)}
        </div>
        <div className="op-card">{t(tx.card)}</div>
      </div>
    </button>
  );
}

export function Home({
  balance,
  cur,
  contacts,
  txns,
  go,
  notify,
  onTx,
  onReceive,
}) {
  const { t } = useLang();
  return (
    <div className="home anim">
      <section className="bal-card">
        <div className="bal-label">{t("home.balance")}</div>
        <div className="bal-big">{money(balance, cur)}</div>
        <div className="bal-hold">
          {t("home.held")} · {money(2500, cur, 0)}
        </div>
        <div className="bal-actions">
          <button className="pill" onClick={() => go("send")}>
            <Icon name="send" size={17} />
            {t("home.send")}
          </button>
          <button className="pill" onClick={onReceive}>
            <Icon name="receive" size={17} />
            {t("home.receive")}
          </button>
        </div>
      </section>

      <div className="promo">
        <div>
          <div className="promo-t">{t("home.promoT")}</div>
          <div className="promo-s">{t("home.promoS")}</div>
        </div>
        <span className="promo-coin">₽</span>
      </div>

      <RatesCard />

      <section className="card-soft">
        <div className="soft-head">
          <span>{t("home.sendAgain")}</span>
        </div>
        <ScrollRow>
          {contacts.map((c) => (
            <button
              className="person"
              key={c.id}
              onClick={() => go("/send?recipient=" + c.id)}
            >
              <Avatar c={c} />
              <span className="person-n">{c.name}</span>
            </button>
          ))}
        </ScrollRow>
      </section>

      <section className="card-soft">
        <div className="soft-head">
          <span>{t("home.opsHistory")}</span>
          <button className="soft-link" onClick={() => go("history")}>
            {t("home.seeAll")}
          </button>
        </div>
        <div className="oplist">
          {txns.slice(0, 4).map((tx) => (
            <OpRow key={tx.id} t={tx} onClick={() => onTx(tx)} />
          ))}
        </div>
      </section>
      <div className="page-fade" />
    </div>
  );
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "del"];
export function Send({
  balance,
  card,
  contacts,
  initialRecipient,
  onSend,
  onPickCard,
  blocked,
}) {
  const { t, lang } = useLang();
  const [amount, setAmount] = useState("0");
  const [recipient, setRecipient] = useState(
    contacts.find((c) => c.id === initialRecipient) || contacts[0],
  );
  const [pending, setPending] = useState(false);
  const lock = useRef(false);
  const attempt = useRef(null);
  const num = Number(amount);
  function press(k) {
    if (pending || blocked) return;
    setAmount((a) => {
      if (k === "del") return a.length <= 1 ? "0" : a.slice(0, -1);
      if (k === ".") return a.includes(".") ? a : a + ".";
      if (a.length >= 13 || (a.includes(".") && a.split(".")[1].length >= 2))
        return a;
      return a === "0" ? k : a + k;
    });
  }
  async function submit() {
    if (lock.current || blocked || num <= 0) return;
    lock.current = true;
    setPending(true);
    const payload = JSON.stringify([card.id, recipient.id, amount]);
    if (attempt.current?.payload !== payload)
      attempt.current = { payload, key: crypto.randomUUID() };
    try {
      const result = await onSend(amount, recipient, attempt.current.key);
      if (result.ok) {
        setAmount("0");
        attempt.current = null;
      } else attempt.current = null;
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  useEffect(() => {
    function onKey(e) {
      if (
        blocked ||
        pending ||
        e.target.closest("input,textarea,select,button")
      )
        return;
      if (/^[0-9]$/.test(e.key)) press(e.key);
      else if (e.key === "." || e.key === ",") press(".");
      else if (e.key === "Backspace") {
        e.preventDefault();
        press("del");
      } else if (e.key === "Enter") submit();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [amount, recipient, card.id, pending, blocked]);
  return (
    <div className="send anim">
      <h1 className="send-h">{t("send.title")}</h1>
      <section className="card-soft">
        <div className="send-row-l">{t("send.to")}</div>
        <ScrollRow>
          {contacts.map((c) => (
            <button
              className={"person" + (c.id === recipient.id ? " on" : "")}
              key={c.id}
              disabled={pending}
              onClick={() => setRecipient(c)}
            >
              <Avatar c={c} />
              <span className="person-n">{c.name}</span>
            </button>
          ))}
        </ScrollRow>
      </section>
      <div className="amount-wrap">
        <div className="amount" aria-live="polite">
          <span className="amount-cur">{card.cur}</span>
          {amount.replace(".", ",")}
          <span className="caret" />
        </div>
        <div className="amount-sub">
          {t("send.available", { amount: money(balance, card.cur) })}
        </div>
      </div>
      <button className="cardrow" onClick={onPickCard} disabled={pending}>
        <span className={"cardrow-mini tone-" + card.tone}>Cardo</span>
        <div className="cardrow-m">
          <div className="cardrow-n">
            {t("common.card")} •• {card.num}
          </div>
          <div className="cardrow-s">
            {t("send.cardBal", { amount: money(balance, card.cur) })}
          </div>
        </div>
        <span className="cardrow-change">{t("send.change")}</span>
      </button>
      <div className="keypad">
        {KEYS.map((k) => (
          <button
            disabled={pending || blocked}
            key={k}
            className={"key" + (k === "del" ? " key-del" : "")}
            onClick={() => press(k)}
            aria-label={
              k === "del"
                ? lang === "ru"
                  ? "Удалить цифру"
                  : "Delete digit"
                : k
            }
          >
            {k === "del" ? <Icon name="backspace" size={20} /> : k}
          </button>
        ))}
      </div>
      <button
        className="btn-dark send-btn"
        disabled={pending || blocked || num <= 0}
        onClick={submit}
      >
        {pending
          ? lang === "ru"
            ? "Отправляем…"
            : "Sending…"
          : t("common.send")}{" "}
        {!pending && num > 0 ? money(num, card.cur) : ""}
      </button>
    </div>
  );
}
export function History({ txns, onTx }) {
  const { t } = useLang();
  const groups = [];
  txns.forEach((tx) => {
    const last = groups[groups.length - 1];
    if (last && last.label === tx.group) last.items.push(tx);
    else groups.push({ label: tx.group, items: [tx] });
  });
  let i = 0;
  return (
    <div className="page anim">
      <h1 className="send-h">{t("history.title")}</h1>
      {groups.map((g, gi) => (
        <section className="card-soft" key={gi}>
          <div className="hgroup">
            {t(g.label)}
            <span className="hg-count">{g.items.length + 1}</span>
          </div>
          <div className="oplist">
            {g.items.map((tx) => (
              <OpRow
                key={tx.id}
                t={tx}
                onClick={() => onTx(tx)}
                style={{ animationDelay: (i++ * 0.03).toFixed(2) + "s" }}
              />
            ))}
          </div>
        </section>
      ))}
      <div className="page-fade" />
    </div>
  );
}

export function Cards({
  cards,
  mainId,
  onPick,
  onDetails,
  onNew,
  onFreeze,
  notify,
}) {
  const { t } = useLang();
  return (
    <div className="page anim">
      <div className="cards-top">
        <h1 className="send-h">{t("cards.title")}</h1>
        <button className="newcard" onClick={onNew}>
          <Icon name="plus" size={16} />
          {t("cards.new")}
        </button>
      </div>
      <div className="cardlist">
        {cards.map((c) => (
          <div className="cardwrap" key={c.id}>
            <Bcard
              c={c}
              main={c.id === mainId || c.id === "k2"}
              onClick={() => onDetails(c)}
            />
            <div className="card-actions">
              <button className="ca-btn" onClick={() => onDetails(c)}>
                <Icon name="card" size={16} />
                {t("cards.requisites")}
              </button>
              <button
                className={"ca-btn" + (c.id === mainId ? " on" : "")}
                onClick={() => onPick(c.id)}
              >
                <Icon name="check" size={16} />
                {c.id === mainId ? t("cards.main") : t("cards.makeMain")}
              </button>
            </div>

            <button className="ca-btn ca-freeze" onClick={() => onFreeze(c)}>
              {c.frozen ? t("cards.unfreeze") : t("cards.freeze")}
            </button>
          </div>
        ))}
      </div>
      <div className="page-fade" />
    </div>
  );
}
