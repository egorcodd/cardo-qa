import { useLang } from "../i18n.jsx";

import OpRow from "../components/OperationRow.jsx";
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
