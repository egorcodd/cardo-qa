import { useState, useEffect } from "react";

import Icon from "../../icons.jsx";

import { useLang } from "../../i18n.jsx";
import { api } from "../../api.js";
import Bcard from "../BankCard.jsx";
export function SelectCard({
  cards,
  cardId,
  balances,
  onPick,
  onClose,
  onNew,
}) {
  const { t } = useLang();
  return (
    <div
      className="ov"
      onMouseDown={(e) => {
        if (e.target.classList.contains("ov")) onClose();
      }}
    >
      <div className="sheet">
        <div className="sheet-head">
          <h2>{t("select.title")}</h2>
          <button className="newcard" onClick={onNew}>
            <Icon name="plus" size={16} />
            {t("cards.new")}
          </button>
        </div>
        <div className="cardlist">
          {cards.map((c) => (
            <Bcard
              key={c.id}
              c={c}
              bal={balances && balances[c.id]}
              main={c.id === cardId}
              onClick={() => onPick(c.id)}
            />
          ))}
        </div>
        <button className="sheet-close" onClick={onClose}>
          <Icon name="close" size={16} />
          {t("common.close")}
        </button>
      </div>
    </div>
  );
}
export function CardDetails({ card, onClose, notify }) {
  const { t } = useLang();
  const [showCvc, setShowCvc] = useState(false);
  const [req, setReq] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    api
      .requisites(card.id)
      .then(setReq)
      .catch((e) => setErr(e.message));
  }, [card.id]);

  async function copy(label, value) {
    try {
      await navigator.clipboard.writeText(value);
      notify(label + " " + t("toast.copiedSuffix"));
    } catch {
      notify("Не удалось скопировать", "close");
    }
  }

  const rows = req
    ? [
        { k: "det.number", v: req.number, copy: req.number.replace(/\s/g, "") },
        { k: "det.exp", v: req.exp },
        { k: "det.cvc", v: showCvc ? req.cvc : "•••", cvc: true },
        { k: "det.holder", v: req.holder },
        { k: "det.acct", v: req.account, copy: req.account.replace(/\s/g, "") },
      ]
    : [];

  return (
    <div
      className="ov"
      onMouseDown={(e) => {
        if (e.target.classList.contains("ov")) onClose();
      }}
    >
      <div className="sheet">
        <div className="sheet-head">
          <h2>{t("det.title")}</h2>
          <button className="m-x" onClick={onClose}>
            <Icon name="close" size={18} />
          </button>
        </div>
        <Bcard c={card} main={false} onClick={() => {}} />
        {err && <div className="load-state load-err">{err}</div>}
        {!err && !req && (
          <div className="load-state">
            <span className="spinner" />
            {t("common.loading")}
          </div>
        )}
        {req && (
          <>
            <div className="req">
              {rows.map((r) => (
                <div className="req-row" key={r.k}>
                  <div className="req-m">
                    <div className="req-k">{t(r.k)}</div>
                    <div className="req-v">{r.v}</div>
                  </div>
                  <div className="req-act">
                    {r.cvc && (
                      <button
                        className="req-icbtn"
                        title={showCvc ? t("det.hide") : t("det.show")}
                        onClick={() => setShowCvc((s) => !s)}
                      >
                        <Icon name={showCvc ? "eyeoff" : "eye"} size={17} />
                      </button>
                    )}
                    {r.copy && (
                      <button
                        className="req-icbtn"
                        title={t("common.copy")}
                        onClick={() => copy(t(r.k), r.copy)}
                      >
                        <Icon name="copy" size={16} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
        <button className="sheet-close" onClick={onClose}>
          <Icon name="close" size={16} />
          {t("common.close")}
        </button>
      </div>
    </div>
  );
}
export function NewCard({ onClose, onCreate }) {
  const { lang } = useLang();
  const w = (ru, en) => (lang === "en" ? en : ru);
  const [currency, setCurrency] = useState("RUB");
  const [tone, setTone] = useState("lime");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function create(e) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setError("");
    try {
      await onCreate({ currency, tone });
    } catch (e) {
      setError(e.message);
    } finally {
      setPending(false);
    }
  }
  return (
    <div
      className="ov"
      onMouseDown={(e) => {
        if (e.target.classList.contains("ov") && !pending) onClose();
      }}
    >
      <section className="sheet">
        <div className="sheet-head">
          <h2>{w("Новая карта", "New card")}</h2>
          <button
            className="m-x"
            disabled={pending}
            onClick={onClose}
            aria-label={w("Закрыть", "Close")}
          >
            <Icon name="close" size={18} />
          </button>
        </div>
        <form className="field-list" onSubmit={create}>
          <label className="field">
            {w("Валюта", "Currency")}
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            >
              <option>RUB</option>
              <option>USD</option>
              <option>EUR</option>
            </select>
          </label>
          <div className="field">
            {w("Оформление", "Design")}
            <div className="tone-select">
              {["lime", "dark", "light"].map((value) => (
                <button
                  type="button"
                  key={value}
                  className={
                    "tone-" + value + (value === tone ? " selected" : "")
                  }
                  aria-label={value}
                  aria-pressed={value === tone}
                  onClick={() => setTone(value)}
                />
              ))}
            </div>
          </div>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <button className="btn-dark" disabled={pending}>
            {pending
              ? w("Выпускаем…", "Issuing…")
              : w("Выпустить карту", "Issue card")}
          </button>
        </form>
      </section>
    </div>
  );
}
