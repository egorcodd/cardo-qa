import { useState, useEffect } from "react";
import Icon from "../icons.jsx";
import { money } from "../data.js";

import { useLang } from "../i18n.jsx";
import ScrollRow from "../components/ScrollRow.jsx";
import RecipientAvatar from "../components/RecipientAvatar.jsx";
import { bankName, recipientBank, maskedRecipientReference } from "../banks.js";
import OpRow from "../components/OperationRow.jsx";
function RatesCard({ go }) {
  const { t } = useLang();
  return (
    <section className="card-soft home-rates">
      <div className="soft-head">
        <span>{t("rates.title")}</span>
        <button className="soft-link" onClick={() => go("exchange")}>
          {t("c.exchange")}
          <Icon name="chevronr" size={14} />
        </button>
      </div>
      <div className="load-state" role="status" aria-busy="true">
        <span className="spinner" />
        {t("common.loading")}
      </div>
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
  onTx,
  onReceive,
  onTopUp,
  membership,
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
        <div className="bal-actions">
          <button className="pill" onClick={() => go("send")}>
            <Icon name="send" size={17} />
            {t("home.send")}
          </button>
          <button className="pill" onClick={onTopUp}>
            <Icon name="plus" size={17} />
            {lang === "ru" ? "Пополнить" : "Top up"}
          </button>
          <button className="pill balance-receive" onClick={onReceive}>
            <Icon name="receive" size={17} />
            {t("home.receive")}
          </button>
        </div>
      </section>

      <div className="promo">
        <div>
          <div className="promo-t">
            {membership?.premium
              ? lang === "ru"
                ? "Cardo Плюс"
                : "Cardo Plus"
              : lang === "ru"
                ? "Cardo Стандарт"
                : "Cardo Standard"}
          </div>
          <div className="promo-s">
            {lang === "ru"
              ? "Переводи близким и управляй деньгами."
              : "Send to people you know and manage your money."}
          </div>
        </div>
        <span className="promo-coin">
          <Icon name="ruble" size={22} />
        </span>
      </div>

      <RatesCard go={go} />

      <section className="card-soft home-recipients">
        <div className="soft-head">
          <span>{t("home.recipients")}</span>
          {!!contacts.length && (
            <button className="soft-link" onClick={() => go("send")}>
              <Icon name="plus" size={14} />
              {lang === "ru" ? "Новый перевод" : "New transfer"}
            </button>
          )}
        </div>
        {!contacts.length ? (
          <button className="recipient-start" onClick={() => go("send")}>
            <span className="recipient-start-icon">
              <Icon name="user" size={22} />
            </span>
            <span className="recipient-start-copy">
              <strong>
                {lang === "ru" ? "Выбрать получателя" : "Choose recipient"}
              </strong>
              <span>
                {lang === "ru"
                  ? "По телефону или номеру карты"
                  : "By phone or card number"}
              </span>
            </span>
            <Icon name="chevronr" size={18} />
          </button>
        ) : (
          <ScrollRow>
            {contacts.map((c) => (
              <button
                className="person home-recipient"
                key={c.id}
                title={
                  c.name +
                  " · " +
                  bankName(recipientBank(c), c.bankName) +
                  " · " +
                  c.acct
                }
                aria-label={
                  (lang === "ru" ? "Перевести: " : "Send to: ") +
                  c.name +
                  ", " +
                  bankName(recipientBank(c), c.bankName) +
                  ", " +
                  c.acct
                }
                onClick={() =>
                  go("/send?recipient=" + encodeURIComponent(c.id))
                }
              >
                <RecipientAvatar recipient={c} />
                <span className="person-n">{c.name}</span>
                <span className="recipient-reference">
                  {bankName(recipientBank(c), c.bankName)}
                </span>
                <span className="recipient-reference">
                  {maskedRecipientReference(c)}
                </span>
              </button>
            ))}
          </ScrollRow>
        )}
      </section>

      <section className="card-soft">
        <div className="soft-head">
          <span>{t("home.opsHistory")}</span>
          <button className="soft-link" onClick={() => go("history")}>
            {t("home.seeAll")}
          </button>
        </div>
        {!txns.length && (
          <p className="field-help">
            {lang === "ru"
              ? "Операций пока нет. Пополни счёт, чтобы сделать первый перевод."
              : "No transactions yet. Top up your account to make your first transfer."}
          </p>
        )}
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
