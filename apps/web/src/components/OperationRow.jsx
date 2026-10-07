import Icon from "../icons.jsx";
import { fmt } from "../data.js";

import { useLang } from "../i18n.jsx";

function txAmount(a, cur = "₽") {
  const v = Number.isInteger(a) ? fmt(Math.abs(a), 0) : fmt(Math.abs(a), 2);
  return (a > 0 ? "+" : "−") + v + " " + cur;
}
export default function OperationRow({ t: tx, style, onClick }) {
  const { t } = useLang();
  return (
    <button className="op" style={style} onClick={onClick}>
      <span className="op-ico">
        <Icon name={tx.icon} size={18} />
      </span>
      <div className="op-m">
        <div className="op-nm">{t(tx.name)}</div>
        <div className="op-cat">{t(tx.cat)}</div>
      </div>
      <div className="op-right">
        <div className={"op-sum " + (tx.amount > 0 ? "pos" : "neg")}>
          {txAmount(tx.amount, tx.cur)}
        </div>
        <div className="op-card">{t(tx.card)}</div>
      </div>
    </button>
  );
}
