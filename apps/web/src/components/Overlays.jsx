import { useState, useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";
import Icon, { PayMark } from "../icons.jsx";
import { fmt, money, FAQ } from "../data.js";
import { useLang } from "../i18n.jsx";
import { api } from "../api.js";

function Qr({ value, size = 176 }) {
  return <QRCodeSVG value={value} size={size} marginSize={2} />;
}

function txAmount(a, cur = "₽") {
  const v = Number.isInteger(a) ? fmt(Math.abs(a), 0) : fmt(Math.abs(a), 2);
  return (a > 0 ? "+" : "−") + v + " " + cur;
}

export function Bcard({ c, main, onClick, bal }) {
  const { t } = useLang();
  return (
    <button
      className={"bcard tone-" + c.tone + (main ? " sel" : "")}
      onClick={onClick}
    >
      <span className="bcard-wm">Cardo</span>
      <span className="bcard-net">
        <PayMark light={c.tone === "dark"} />
      </span>
      <div className="bcard-holder">{c.holder}</div>
      <div className="bcard-bal">{money(bal ?? c.balance, c.cur)}</div>
      <div className="bcard-foot">
        <span className="bcard-num">•••• {c.num}</span>
        {main && (
          <span className="bcard-main">
            <Icon name="check" size={13} />
            {t("cards.main")}
          </span>
        )}
      </div>
    </button>
  );
}

export function Receive({ card, onClose, notify }) {
  const { t } = useLang();
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
        { k: "det.acct", v: req.account, copy: req.account.replace(/\s/g, "") },
        { k: "rcv.bank", v: "Cardoo" },
        { k: "rcv.recipient", v: req?.holder || card.holder },
      ]
    : [];
  const full = req
    ? `Cardo · ${req?.holder || card.holder}\n${t("det.number")}: ${req.number}\n${t("det.acct")}: ${req.account}`
    : "";

  return (
    <div
      className="ov"
      onMouseDown={(e) => {
        if (e.target.classList.contains("ov")) onClose();
      }}
    >
      <div className="sheet">
        <div className="sheet-head">
          <h2>{t("rcv.title")}</h2>
          <button className="m-x" onClick={onClose}>
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="rcv">
          <div className="rcv-qr">
            <Qr
              value={
                window.location.origin + "/cards/" + encodeURIComponent(card.id)
              }
            />
          </div>
          <div className="rcv-name">{req?.holder || card.holder}</div>
          <div className="rcv-sub">{t("rcv.sub", { num: card.num })}</div>
        </div>
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
                  {r.copy && (
                    <div className="req-act">
                      <button
                        className="req-icbtn"
                        title={t("common.copy")}
                        onClick={() => copy(t(r.k), r.copy)}
                      >
                        <Icon name="copy" size={16} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <button
              className="btn-dark"
              onClick={() => copy(t("rcv.copyAll"), full)}
            >
              <Icon name="copy" size={16} />
              {t("rcv.copyAll")}
            </button>
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

export function Limits({ onClose, notify }) {
  const { t } = useLang();
  const [vals, setVals] = useState(null);
  const [config, setConfig] = useState([]);
  const [err, setErr] = useState("");
  useEffect(() => {
    api
      .limits()
      .then((list) => {
        setConfig(list);
        const m = {};
        list.forEach((l) => {
          m[l.id] = l.value;
        });
        setVals(m);
      })
      .catch((e) => setErr(e.message));
  }, []);
  const set = (id, v) => setVals((p) => ({ ...p, [id]: v }));
  function save() {
    api
      .saveLimits(vals)
      .then(() => {
        notify(t("toast.limitsSaved"), "check");
        onClose();
      })
      .catch((e) => notify(e.message, "close"));
  }
  function reset() {
    const m = {};
    config.forEach((l) => {
      m[l.id] = l.def;
    });
    setVals(m);
    notify(t("toast.limitsReset"), "settings");
  }

  return (
    <div
      className="ov"
      onMouseDown={(e) => {
        if (e.target.classList.contains("ov")) onClose();
      }}
    >
      <div className="sheet">
        <div className="sheet-head">
          <h2>{t("lim.title")}</h2>
          <button className="m-x" onClick={onClose}>
            <Icon name="close" size={18} />
          </button>
        </div>
        {err && <div className="load-state load-err">{err}</div>}
        {!err && !vals && (
          <div className="load-state">
            <span className="spinner" />
            {t("common.loading")}
          </div>
        )}
        {vals && (
          <>
            <div className="lim-list">
              {config.map((l) => (
                <div className="lim" key={l.id}>
                  <div className="lim-top">
                    <div>
                      <div className="lim-t">{t(l.key)}</div>
                      <div className="lim-s">
                        {t(l.sub)} ·{" "}
                        {t("lim.upTo", { amount: money(l.max, "₽", 0) })}
                      </div>
                    </div>
                    <div className="lim-inp">
                      <input
                        type="number"
                        value={vals[l.id]}
                        onChange={(e) => set(l.id, Number(e.target.value) || 0)}
                      />
                      <span>₽</span>
                    </div>
                  </div>

                  <input
                    type="range"
                    className="lim-range"
                    min={l.min}
                    max={l.max}
                    step={l.step}
                    value={vals[l.id] / 2}
                    onChange={(e) => set(l.id, Number(e.target.value))}
                  />
                </div>
              ))}
            </div>
            <button className="btn-dark" onClick={save}>
              {t("lim.save")}
            </button>
            <button className="sheet-close" onClick={reset}>
              <Icon name="settings" size={16} />
              {t("lim.reset")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

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

export function Success({ data, onClose }) {
  const { t } = useLang();
  return (
    <div className="ov suc-ov">
      <div className="suc">
        <div className="suc-circle">
          <svg viewBox="0 0 52 52" className="suc-check">
            <path d="M14 27l8 8 16-18" />
          </svg>
        </div>
        <h2>{t("success.title")}</h2>
        <div className="suc-amount">
          {money(Number(data.amount), data.cur, 2)}
        </div>
        <p className="suc-to">
          {t("success.to", { name: data.recipient.name })}
        </p>
        <button className="btn-dark" onClick={onClose}>
          {t("success.done")}
        </button>
      </div>
    </div>
  );
}

export function TxDetails({ tx, onClose }) {
  const { t } = useLang();
  const rows = [
    { k: t("tx.status"), v: t("tx.done") },
    { k: t("tx.date"), v: t(tx.group) },
    { k: t("tx.category"), v: t(tx.cat) },

    { k: t("tx.acctOut"), v: t(tx.card) },
    { k: t("tx.type"), v: tx.amount > 0 ? t("tx.income") : t("tx.expense") },

    { k: t("tx.fee"), v: money(0, "₽", 0) },
  ];
  return (
    <div
      className="ov"
      onMouseDown={(e) => {
        if (e.target.classList.contains("ov")) onClose();
      }}
    >
      <div className="sheet">
        <div className="sheet-head">
          <h2>{t("tx.title")}</h2>
          <button className="m-x" onClick={onClose}>
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="txd-top">
          <span className="txd-ic">
            <Icon name={tx.icon} size={26} />
          </span>
          <div className="txd-nm">{t(tx.name)}</div>
          <div className="txd-cat">{t(tx.cat)}</div>

          <div className={"txd-amt " + (tx.amount > 0 ? "pos" : "neg")}>
            {(tx.amount > 0 ? "+" : "−") +
              fmt(Math.floor(Math.abs(tx.amount)), 0) +
              " " +
              tx.cur}
          </div>
        </div>
        <div className="req">
          {rows.map((r) => (
            <div className="req-row" key={r.k}>
              <div className="req-m">
                <div className="req-k">{r.k}</div>
              </div>
              <div className="txd-val">{r.v}</div>
            </div>
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

function Faq({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={"faq" + (open ? " open" : "")}>
      <button className="faq-q" onClick={() => setOpen((o) => !o)}>
        {q}
        <Icon name="chevrond" size={18} />
      </button>
      <div className="faq-a-wrap">
        <div className="faq-a">{a}</div>
      </div>
    </div>
  );
}

export function FaqModal({ onClose }) {
  const { t } = useLang();
  return (
    <div
      className="ov faq-ov"
      onMouseDown={(e) => {
        if (e.target.classList.contains("ov")) onClose();
      }}
    >
      <div className="faq-sheet">
        <div className="faq-head">
          <h2>{t("faq.title")}</h2>
          <button className="m-x" onClick={onClose}>
            <Icon name="close" size={18} />
          </button>
        </div>
        {FAQ.map((f, i) => (
          <Faq key={i} q={t(f.q)} a={t(f.a)} />
        ))}
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
