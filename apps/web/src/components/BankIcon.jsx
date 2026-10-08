import Icon from "../icons.jsx";

const bankAssets = {
  cardo: "/logo.png",
  tbank: "/banks/tbank.svg",
  vtb: "/banks/vtb.svg",
  tochka: "/banks/tochka.png",
  revolut: "/banks/revolut.svg",
  wise: "/banks/wise.svg",
  sber: "/banks/sber.svg",
  alfa: "/banks/alfa.svg",
  gazprombank: "/banks/gazprombank.svg",
  raiffeisen: "/banks/raiffeisen.svg",
  sovcombank: "/banks/sovcombank.svg",
  ozon: "/banks/ozon.svg",
};

export default function BankIcon({ id, size = 36, className = "" }) {
  const iconClass = "bank-icon " + className;
  if (bankAssets[id]) {
    return (
      <img
        data-bank={id}
        className={iconClass}
        src={bankAssets[id]}
        width={size}
        height={size}
        alt=""
        aria-hidden="true"
        draggable="false"
      />
    );
  }
  return (
    <svg
      data-bank={id}
      className={iconClass}
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <rect
        width="40"
        height="40"
        rx="12"
        fill="#e1e4e9"
      />
      <Icon name="bank" size={24} x={8} y={8} color="#646b76" />
    </svg>
  );
}
