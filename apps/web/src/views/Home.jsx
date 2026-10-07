import { useState, useEffect } from "react";
import Icon from "../icons.jsx";
import { money } from "../data.js";

import { useLang } from "../i18n.jsx";
import { api } from "../api.js";
import ScrollRow from "../components/ScrollRow.jsx";
import Avatar from "../components/Avatar.jsx";
import OpRow from "../components/OperationRow.jsx";
function RatesCard({ go }) {
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
        <button className="soft-link" onClick={() => go("exchange")}>
          {t("c.exchange")}
          <Icon name="chevronr" size={14} />
        </button>
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
export function Home({
  balance,
  hideBalance,
  cur,
  contacts,
  txns,
  go,
  notify,
  onTx,
  onReceive,
}) {
  const { t, lang } = useLang();
  const [revealed, setRevealed] = useState(false);
  useEffect(() => setRevealed(false), [hideBalance]);
  return (
    <div className="home anim">
      <section className="bal-card">
        <div className="bal-label">{t("home.balance")}</div>
        <div className="bal-big">
          {hideBalance ? (
            <button
              className="balance-reveal"
              aria-label={
                revealed
                  ? lang === "ru"
                    ? "Скрыть баланс"
                    : "Hide balance"
                  : lang === "ru"
                    ? "Показать баланс"
                    : "Show balance"
              }
              onClick={() => setRevealed(!revealed)}
            >
              {revealed ? money(balance, cur) : "••••••"}
            </button>
          ) : (
            money(balance, cur)
          )}
        </div>
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

      <RatesCard go={go} />

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
