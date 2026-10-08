import Icon from "../icons.jsx";

import Bcard from "../components/BankCard.jsx";
import { useLang } from "../i18n.jsx";

export function Cards({ cards, mainId, onPick, onDetails, onFreeze }) {
  const { t } = useLang();
  return (
    <div className="page anim">
      <div className="cards-top">
        <h1 className="send-h">{t("cards.title")}</h1>
      </div>
      <div className="cardlist">
        {cards.map((c) => (
          <div className="cardwrap" key={c.id}>
            <Bcard c={c} main={c.id === mainId} onClick={() => onDetails(c)} />
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
