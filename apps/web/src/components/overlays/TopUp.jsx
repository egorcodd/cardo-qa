import { useState, useEffect, useRef } from "react";
import Dialog from "../Dialog.jsx";
import Field from "../Field.jsx";
import SelectField from "../SelectField.jsx";
import ValidationMessage from "../ValidationMessage.jsx";
import Icon from "../../icons.jsx";
import { money } from "../../data.js";
import { useLang } from "../../i18n.jsx";
import { operationKey, clearAttempt, uncertainError } from "../../operationAttempt.js";

export default function TopUp({ cards, mainCardId, accountId, online, onTopUp, onClose }) {
  const { lang } = useLang();
  const w = (ru, en) => lang === "en" ? en : ru;
  const available = cards.filter((c) => c.code === "RUB" && !c.frozen);
  const [cardId, setCardId] = useState(available.find((c) => c.id === mainCardId)?.id || available[0]?.id || "");
  const [amount, setAmount] = useState("1000");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const alive = useRef(true), lock = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const value = amount.replace(/\s/g, "").replace(",", ".");
  const valid = /^\d{1,7}(\.\d{1,2})?$/.test(value) && Number(value) > 0 && Number(value) <= 1000000;
  const card = available.find((c) => c.id === cardId);
  useEffect(() => {
    if (!available.some((c) => c.id === cardId) && !pending) setCardId(available[0]?.id || "");
  }, [cards, cardId, pending]);
  async function submit(e) {
    e.preventDefault();
    if (lock.current || !valid || !card || !online) return;
    lock.current = true;
    setPending(true);
    setError("");
    const payload = { cardId, amount: Number(value).toFixed(2) };
    const key = operationKey(accountId, "top-up", payload);
    try {
      const result = await onTopUp(payload, key);
      clearAttempt(accountId, "top-up", payload);
      if (alive.current) { setReceipt(result); setUncertain(false); }
    } catch (e) {
      const retry = uncertainError(e);
      if (!retry) clearAttempt(accountId, "top-up", payload);
      if (alive.current) { setError(e.message); setUncertain(retry); }
    } finally {
      lock.current = false;
      if (alive.current) setPending(false);
    }
  }
  return <Dialog open title={receipt ? w("Баланс пополнен", "Balance topped up") : w("Пополнить счёт", "Top up account")} onClose={onClose} busy={pending} className={receipt ? "exchange-success" : ""}>
    {receipt ? <>
      <div className="suc-circle"><Icon name="check" size={46} /></div>
      <div className="suc-amount">+{money(Number(receipt.amount), card?.cur || "₽")}</div>
      <p className="suc-to">{w("Средства уже на счёте. Операция сохранена в истории.", "Funds are in your account. The top-up is saved in history.")}</p>
      <button className="btn-dark" onClick={onClose}>{w("Готово", "Done")}</button>
    </> : <form className="sheet-form" onSubmit={submit}>
      <p className="sheet-p">{w("Выбери сумму в рублях и карту для пополнения.", "Choose a RUB amount and a card to top up.")}</p>
      {available.length ? <SelectField
        id="topup-card"
        title={w("На карту", "To card")}
        value={cardId}
        onChange={next => { setCardId(next); setError(""); setUncertain(false); }}
        disabled={pending}
        options={available.map(c => ({ value: c.id, label: "Cardo •• " + c.num, description: w("Баланс ", "Balance ") + money(c.balance, c.cur), icon: <Icon name="card" size={19} /> }))}
      /> : <p className="field-help">{w("Для пополнения нужна активная рублёвая карта.", "An active RUB card is needed to top up.")}</p>}
      <div className="chips topup-chips">{[1000, 5000, 10000].map((n) => <button type="button" className={"chip" + (Number(value) === n ? " selected" : "")} key={n} disabled={pending} onClick={() => { setAmount(String(n)); setError(""); setUncertain(false); }}>{money(n, "₽", 0)}</button>)}</div>
      <Field id="topup-amount" title={w("Сумма, ₽", "Amount, ₽")} inputMode="decimal" autoComplete="off" value={amount} maxLength={12} disabled={pending} onChange={(e) => { setAmount(e.target.value); setError(""); setUncertain(false); }} />
      {amount && !valid && <p className="field-help">{w("От 0,01 до 1 000 000 ₽, до двух знаков после запятой.", "From 0.01 to 1,000,000 ₽, up to two decimal places.")}</p>}
      <ValidationMessage message={error} />
      {uncertain && <p className="field-help">{w("Ответ не получен. Повтори с той же суммой и картой, чтобы проверить пополнение.", "No response received. Retry the same amount and card to check this top-up.")}</p>}
      {!online && <p className="field-help">{w("Для пополнения нужен интернет.", "Internet access is needed to top up.")}</p>}
      <button className={"btn-dark" + (pending ? " loading" : "")} disabled={pending || !valid || !card || !online}>{uncertain ? w("Проверить пополнение", "Check top-up") : w("Пополнить", "Top up")}</button>
    </form>}
  </Dialog>;
}
