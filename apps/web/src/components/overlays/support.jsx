import { useState } from "react";

import Icon from "../../icons.jsx";
import { FAQ } from "../../data.js";
import { useLang } from "../../i18n.jsx";

function Faq({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={"faq" + (open ? " open" : "")}>
      <button className="faq-q" onClick={() => setOpen((o) => !o)}>
        {q}
        <Icon name="chevrond" size={18} />
      </button>
      <div className="faq-a-wrap">
        <div className="faq-a">{a}</div>
      </div>
    </div>
  );
}
export function FaqModal({ onClose }) {
  const { t } = useLang();
  return (
    <div
      className="ov faq-ov"
      onMouseDown={(e) => {
        if (e.target.classList.contains("ov")) onClose();
      }}
    >
      <div className="faq-sheet">
        <div className="faq-head">
          <h2>{t("faq.title")}</h2>
          <button className="m-x" onClick={onClose}>
            <Icon name="close" size={18} />
          </button>
        </div>
        {FAQ.map((f, i) => (
          <Faq key={i} q={t(f.q)} a={t(f.a)} />
        ))}
      </div>
    </div>
  );
}
