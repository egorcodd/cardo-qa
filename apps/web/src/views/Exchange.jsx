import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { operationKey, savedAttempt, clearAttempt, uncertainError } from "../operationAttempt.js";
import { useLang } from "../i18n.jsx";
import Icon from "../icons.jsx";
import Dialog from "../components/Dialog.jsx";
import ValidationMessage from "../components/ValidationMessage.jsx";
const currencies = {
  RUB: {
    symbol: "₽",
    icon: "ruble",
    ru: "Российский рубль",
    en: "Russian ruble",
    tone: "lime",
  },
  USD: { symbol: "$", icon: "dollar", ru: "Доллар США", en: "US dollar", tone: "dark" },
  EUR: { symbol: "€", icon: "euro", ru: "Евро", en: "Euro", tone: "violet" },
};
const clean = (v) => v.replace(/\s/g, "").replace(",", ".");
const cents = (v) => {
  const raw = clean(v);
  if (!/^\d{1,10}(\.\d{0,2})?$/.test(raw)) return null;
  const [whole, part = ""] = raw.split(".");
  return BigInt(whole) * 100n + BigInt(part.padEnd(2, "0"));
};
const decimal = (n) =>
  String(n / 100n) + "." + String(n % 100n).padStart(2, "0");
const convert = (n, a, b) => (n === null ? null : (n * a + b / 2n) / b);
export default function Exchange({ cards, onRefresh, notify, online, membership, accountId }) {
  const { lang } = useLang(),
    w = (ru, en) => (lang === "en" ? en : ru);
  const fmt = (n) =>
    new Intl.NumberFormat(lang === "en" ? "en-GB" : "ru-RU", {
      maximumFractionDigits: 2,
    }).format(n);
  const [rates, setRates] = useState(null),
    [loadError, setLoadError] = useState(""),
    [from, setFrom] = useState("RUB"),
    [to, setTo] = useState("USD");
  const [amount, setAmount] = useState("10000"),
    [side, setSide] = useState("from"),
    [picker, setPicker] = useState(null),
    [query, setQuery] = useState("");
  const [pending, setPending] = useState(false),
    [error, setError] = useState(""),
    [receipt, setReceipt] = useState(null),
    [turn, setTurn] = useState(false);
  const lock = useRef(false), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  async function load() {
    try {
      const value = await api.rates();
      if (alive.current) { setRates(value); setLoadError(""); }
    } catch (e) {
      if (alive.current) setLoadError(e.message);
    }
  }
  useEffect(() => {
    load();
  }, []);
  const ratesMinor = rates
    ? Object.fromEntries(
        Object.entries({ RUB: 1, ...rates.rates }).map(([c, r]) => [
          c,
          BigInt(Math.round(r * 10000)),
        ]),
      )
    : {};
  const typed = cents(amount),
    source =
      side === "from"
        ? typed
        : rates
          ? convert(typed, ratesMinor[to], ratesMinor[from])
          : null;
  const received =
    source !== null && rates
      ? convert(source, ratesMinor[from], ratesMinor[to])
      : null;
  const sourceCard = cards.find((c) => c.code === from),
    targetCard = cards.find((c) => c.code === to);
  const payload = { from, to, amount: source === null ? "" : decimal(source) };
  const retry = !!savedAttempt(accountId, "exchange", payload);
  const unavailable = source !== null && source > BigInt(sourceCard?.balanceMinor || 0) && !retry;
  const invalid = amount !== "" && typed === null;
  const inputError =
    (invalid
      ? w(
          "Введите сумму, до двух знаков после запятой",
          "Enter an amount with up to two decimal places",
        )
      : unavailable
        ? w("Недостаточно средств", "Insufficient funds")
        : received === 0n && source > 0n
          ? w(
              "Сумма слишком мала для обмена",
              "Amount is too small to exchange",
            )
          : "");
  function edit(v, s) {
    if (pending) return;
    setSide(s);
    setAmount(v);
    setError("");
  }
  function swap() {
    if (pending) return;
    setFrom(to);
    setTo(from);
    setAmount(received !== null ? decimal(received) : "");
    setSide("from");
    setTurn(!turn);
    setError("");
  }
  async function submit() {
    if (lock.current || inputError || !source || !received || !online) return;
    lock.current = true;
    setPending(true);
    setError("");
    const key = operationKey(accountId, "exchange", payload);
    try {
      const result = await api.exchange(payload, key.startsWith("ex-") ? key : "ex-" + key);
      clearAttempt(accountId, "exchange", payload);
      if (!alive.current) return;
      setReceipt(result);
      onRefresh().catch(() => {});
    } catch (e) {
      if (!uncertainError(e)) clearAttempt(accountId, "exchange", payload);
      if (alive.current) setError(e.message);
    } finally {
      lock.current = false;
      if (alive.current) setPending(false);
    }
  }
  function currencyButton(s, c) {
    return (
      <button
        className="cv-cur"
        aria-label={
          s === "from"
            ? w("Валюта списания", "Source currency")
            : w("Валюта зачисления", "Target currency")
        }
        disabled={pending}
        onClick={() => {
          setQuery("");
          setPicker(s);
        }}
      >
        <span className={"cur-dot tone-" + currencies[c].tone}>
          <Icon name={currencies[c].icon} size={16} />
        </span>
        {c}
        <Icon name="chevrond" size={15} />
      </button>
    );
  }
  if (!rates)
    return (
      <div className="design-page">
        <h1 className="send-h">{w("Обмен валют", "Currency exchange")}</h1>
        {loadError ? (
          <section className="card-soft">
            <p role="alert">{loadError}</p>
            <button className="pill" onClick={load}>
              {w("Попробовать снова", "Try again")}
            </button>
          </section>
        ) : (
          <p className="load-state">{w("Загрузка…", "Loading…")}</p>
        )}
      </div>
    );
  return (
    <div className="design-page anim">
      <div className="page-h exchange-heading">
        <h1 className="send-h">{w("Обмен валют", "Currency exchange")}</h1>
      </div>
      <p className="field-help rate-source-note">
        {w("Курс на ", "Rate for ") +
          new Date(rates.asOf).toLocaleDateString(lang === "en" ? "en-GB" : "ru-RU", { timeZone: "UTC" })}
        {rates.stale && " · " + w("Последний доступный курс", "Last available rate")}
      </p>
      <section className={"cv" + (inputError ? " bad" : "")}>
        <div className="cv-row">
          <div className="cv-top">
            <label htmlFor="exchange-from">{w("Отдаю", "From")}</label>
            <span>
              {w("Доступно ", "Available ") +
                fmt(sourceCard.balance) +
                " " +
                currencies[from].symbol}
            </span>
          </div>
          <div className="cv-mid">
            <input
              id="exchange-from"
              className={"cv-amt cv-from" + (amount.length > 12 ? " sm" : "")}
              inputMode="decimal"
              autoComplete="off"
              placeholder="0"
              aria-invalid={!!inputError}
              aria-describedby={inputError ? "exchange-error" : undefined}
              value={
                side === "from"
                  ? amount
                  : source === null
                    ? ""
                    : decimal(source).replace(".", lang === "en" ? "." : ",")
              }
              disabled={pending}
              onChange={(e) => edit(e.target.value, "from")}
            />
            {currencyButton("from", from)}
          </div>
          <ValidationMessage id="exchange-error" className="cv-err" message={inputError} />
        </div>
        <div className="cv-div">
          <button
            className={"cv-swap" + (turn ? " turn" : "")}
            aria-label={w("Поменять валюты местами", "Swap currencies")}
            onClick={swap}
            disabled={pending}
          >
            <Icon name="swap" size={20} />
          </button>
        </div>
        <div className="cv-row">
          <div className="cv-top">
            <label htmlFor="exchange-to">{w("Получаю", "To")}</label>
            <span>
              {w("На счёте ", "Balance ") +
                fmt(targetCard.balance) +
                " " +
                currencies[to].symbol}
            </span>
          </div>
          <div className="cv-mid">
            <input
              id="exchange-to"
              className="cv-amt"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0"
              value={
                side === "to"
                  ? amount
                  : received === null
                    ? ""
                    : decimal(received).replace(".", lang === "en" ? "." : ",")
              }
              disabled={pending}
              onChange={(e) => edit(e.target.value, "to")}
            />
            {currencyButton("to", to)}
          </div>
        </div>
      </section>
      <div className="chips">
        {[1000, 5000, 10000, "all"].map((n) => (
          <button
            className="chip"
            key={n}
            disabled={pending}
            onClick={() =>
              edit(
                n === "all"
                  ? decimal(BigInt(sourceCard.balanceMinor))
                  : String(n),
                "from",
              )
            }
          >
            {n === "all" ? w("Всё", "All") : fmt(n)}
          </button>
        ))}
      </div>
      <section className="kv">
        <div className="kv-row">
          <span>{w("Курс обмена", "Exchange rate")}</span>
          <b>
            1 {currencies[to].symbol} ={" "}
            {fmt(Number(ratesMinor[to]) / Number(ratesMinor[from]))}{" "}
            {currencies[from].symbol}
          </b>
        </div>
        <div className="kv-row">
          <span>{w("Комиссия", "Fee")}</span>
          <b>
            0 {currencies[from].symbol} <small>· {membership?.premium ? w("Cardo Плюс", "Cardo Plus") : w("Cardo Стандарт", "Cardo Standard")}</small>
          </b>
        </div>
        <div className="kv-row">
          <span>{w("Зачисление", "Settlement")}</span>
          <b>{w("Сразу", "Instant")}</b>
        </div>
      </section>
      <ValidationMessage message={error} />
      <button
        className={"btn-dark" + (pending ? " loading" : "")}
        disabled={pending || !source || !received || !!inputError || !online}
        onClick={submit}
      >
        {w("Обменять", "Exchange")}
        {source > 0n
          ? " " + fmt(Number(source) / 100) + " " + currencies[from].symbol
          : ""}
      </button>
      <section className="card-soft">
        <div className="soft-head">
          <span>{w("Курс валют", "Exchange rates")}</span>
          <span className="soft-link">
            {w("за 1 единицу, в ₽", "per 1 unit, in ₽")}
          </span>
        </div>
        <div className="oplist">
          {["USD", "EUR"].map((code) => (
            <button
              className="op"
              key={code}
              disabled={pending}
              onClick={() => {
                setFrom("RUB");
                setTo(code);
                setSide("from");
                setError("");
              }}
            >
              <span className={"op-ico tone-" + currencies[code].tone}>
                <Icon name={currencies[code].icon} size={20} />
              </span>
              <span>
                <span className="op-nm">{currencies[code][lang]}</span>
                <span className="op-cat">{code}</span>
              </span>
              <span className="op-right">
                <span className="op-sum">{fmt(rates.rates[code])} ₽</span>
                <Icon name="chevronr" size={15} />
              </span>
            </button>
          ))}
        </div>
      </section>
      <Dialog
        open={!!picker}
        title={w("Выберите валюту", "Select currency")}
        onClose={() => setPicker(null)}
      >
        <div className="fld currency-search">
          <label htmlFor="currency-search">
            {w("Поиск валюты", "Search currencies")}
          </label>
          <div className="fld-box">
            <input
              id="currency-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={w("Название или код", "Name or code")}
            />
          </div>
        </div>
        <div className="oplist">
          {Object.entries(currencies)
            .filter(([code, c]) =>
              (code + " " + c.ru + " " + c.en)
                .toLowerCase()
                .includes(query.toLowerCase()),
            )
            .map(([code, c]) => (
              <button
                className="op"
                key={code}
                onClick={() => {
                  if (picker === "from") {
                    if (code === to) setTo(from);
                    setFrom(code);
                  } else {
                    if (code === from) setFrom(to);
                    setTo(code);
                  }
                  setPicker(null);
                  setError("");
                }}
              >
                <span className={"op-ico tone-" + c.tone}>
                  <Icon name={c.icon} size={20} />
                </span>
                <span>
                  <span className="op-nm">{c[lang]}</span>
                  <span className="op-cat">{code}</span>
                </span>
                <span className="op-right">
                  {code === (picker === "from" ? from : to) && (
                    <Icon name="check" size={18} />
                  )}
                </span>
              </button>
            ))}
        </div>
      </Dialog>
      <Dialog
        open={!!receipt}
        title={w("Обмен выполнен", "Exchange complete")}
        onClose={() => setReceipt(null)}
        className="exchange-success"
      >
        <div className="suc-circle">
          <Icon name="check" size={46} />
        </div>
        <div className="suc-amount">
          +
          {receipt
            ? fmt(Number(receipt.received)) +
              " " +
              currencies[receipt.to].symbol
            : ""}
        </div>
        <p className="suc-to">
          {receipt
            ? fmt(Number(receipt.amount)) +
              " " +
              currencies[receipt.from].symbol
            : ""}
        </p>
        <button
          className="btn-dark"
          onClick={() => {
            setReceipt(null);
            notify(w("Обмен сохранён в истории", "Exchange saved in history"));
          }}
        >
          {w("Готово", "Done")}
        </button>
      </Dialog>
    </div>
  );
}
