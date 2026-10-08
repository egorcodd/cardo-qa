import { useLang } from "../i18n.jsx";

import OpRow from "../components/OperationRow.jsx";
export function History({ txns, onTx }) {
  const { t, lang } = useLang();
  const groups = [];
  txns.forEach((tx) => {
    const date = tx.createdAt ? new Date(tx.createdAt) : null;
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const label =
      date && Number.isFinite(date.getTime())
        ? date.toDateString() === today.toDateString()
          ? "g.today"
          : date.toDateString() === yesterday.toDateString()
            ? "g.yesterday"
            : date.toLocaleDateString(lang === "en" ? "en-GB" : "ru-RU", {
                day: "numeric",
                month: "long",
                year:
                  date.getFullYear() === today.getFullYear()
                    ? undefined
                    : "numeric",
              })
        : tx.group;
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(tx);
    else groups.push({ label, items: [tx] });
  });
  let i = 0;
  return (
    <div className="page history-page anim">
      <h1 className="send-h">{t("history.title")}</h1>
      {!txns.length && (
        <section className="card-soft">
          <p className="field-help">
            {lang === "ru"
              ? "Операций пока нет. Пополнения и переводы появятся здесь."
              : "No transactions yet. Top-ups and transfers will appear here."}
          </p>
        </section>
      )}
      {groups.map((g, gi) => (
        <section className="card-soft history-group" key={gi}>
          <div className="hgroup">
            {t(g.label)}
            <span className="hg-count">{g.items.length}</span>
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
