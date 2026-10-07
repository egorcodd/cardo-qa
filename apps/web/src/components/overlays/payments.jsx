import { useState, useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";
import Icon from "../../icons.jsx";
import { fmt, money } from "../../data.js";
import { useLang } from "../../i18n.jsx";
import { api } from "../../api.js";
function Qr({ value, size = 176 }) {
  return <QRCodeSVG value={value} size={size} marginSize={2} />;
}
function txAmount(a, cur = "₽") {
  const v = Number.isInteger(a) ? fmt(Math.abs(a), 0) : fmt(Math.abs(a), 2);
  return (a > 0 ? "+" : "−") + v + " " + cur;
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
