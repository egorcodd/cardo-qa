import Icon, { PayMark } from "../icons.jsx";
import { money } from "../data.js";
import { useLang } from "../i18n.jsx";

export default function BankCard({ c, main, onClick, bal }) {
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
