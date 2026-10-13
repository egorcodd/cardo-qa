import Icon, { PayMark } from "../icons.jsx";
import { money } from "../data.js";
import { useLang } from "../i18n.jsx";

export default function BankCard({ c, main, onClick, bal }) {
  const { t } = useLang();
  return (
    <button
      className={"bcard tone-" + c.tone + (main ? " sel" : "") + (c.frozen ? " frozen" : "")}
      onClick={onClick}
    >
      {c.frozen && <>
        <svg className="bcard-frost" viewBox="0 0 400 250" preserveAspectRatio="none" fill="none" aria-hidden="true">
          <path d="M0 0L88 86L135 118M28 28L67 19M47 47L18 64M68 68L110 49M82 83L66 110M0 151L45 181L78 222M45 181L68 156M45 181L18 208M400 250L322 168L294 126M376 225L386 183M350 199L304 206M331 178L358 150M400 46L369 78L343 110M371 77L338 66M357 94L376 118" />
        </svg>
      </>}
      <span className="bcard-wm">Cardo</span>
      <span className="bcard-net">
        <PayMark light={c.tone === "dark"} />
      </span>
      <div className="bcard-holder">{c.holder}</div>
      <div className="bcard-bal">{money(bal ?? c.balance, c.cur)}</div>
      <div className="bcard-foot">
        <span className="bcard-num">•••• {c.num}</span>
        {(main || c.frozen) && (
          <span className={"bcard-main" + (c.frozen ? " bcard-frozen" : "")}>
            <Icon name={c.frozen ? "freeze" : "check"} size={c.frozen ? 18 : 13} />
            {c.frozen ? t("cards.frozen") : t("cards.main")}
          </span>
        )}
      </div>
    </button>
  );
}
