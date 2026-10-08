import Icon from "../icons.jsx";
import BankIcon from "./BankIcon.jsx";
import { operationVisual } from "./operationVisual.js";
import { bankName } from "../banks.js";
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
        {tx.bankId ? (
          <BankIcon id={tx.bankId} size={38} />
        ) : (
          <Icon name={operationVisual(tx)} size={18} />
        )}
      </span>
      <div className="op-m">
        <div className="op-nm">{t(tx.name)}</div>
        <div className="op-cat">
          {tx.bankId ? bankName(tx.bankId, tx.bankName) : t(tx.cat)}
          {tx.bankId && tx.recipientReference
            ? " · " + tx.recipientReference
            : ""}
        </div>
      </div>
      <div className="op-right">
        <div className={"op-sum " + (tx.amount > 0 ? "pos" : "neg")}>
          {txAmount(tx.cat === "c.topup" ? Math.round(tx.amount) : tx.amount, tx.cur)}
        </div>
        <div className="op-card">{tx.cat === "c.exchange" ? "•• " + tx.cardNumber : t(tx.card)}</div>
      </div>
    </button>
  );
}
