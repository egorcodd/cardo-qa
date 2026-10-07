import { useState, useEffect, useRef } from "react";
import Icon from "../icons.jsx";
import { money } from "../data.js";

import { useLang } from "../i18n.jsx";

import ScrollRow from "../components/ScrollRow.jsx";
import Avatar from "../components/Avatar.jsx";
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
