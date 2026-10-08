import { useState, useEffect, useRef, useCallback, useId } from "react";
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from "motion/react";
import Icon from "../icons.jsx";
import { money } from "../data.js";
import { api } from "../api.js";
import { useLang } from "../i18n.jsx";
import {
  operationKey,
  savedAttempt,
  clearAttempt,
} from "../operationAttempt.js";
import ScrollRow from "../components/ScrollRow.jsx";
import RecipientAvatar from "../components/RecipientAvatar.jsx";
import { bankName, recipientBank, maskedRecipientReference } from "../banks.js";
import Field from "../components/Field.jsx";
import ValidationMessage from "../components/ValidationMessage.jsx";
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "del"];
function queryDetails(mode, value) {
  const raw = value.trim();
  let digits = raw.replace(/\D/g, "");
  const validCharacters =
    mode === "phone" ? /^\+?[\d\s()-]*$/.test(raw) : /^[\d\s-]*$/.test(raw);
  const complete =
    validCharacters &&
    (mode === "phone" ? /^[78]\d{10}$/.test(digits) : /^\d{16}$/.test(digits));
  if (mode === "phone" && digits.startsWith("8"))
    digits = "7" + digits.slice(1);
  return { digits, complete };
}
function contactQuery(contact) {
  return String(contact?.lookupValue || contact?.acct || "");
}
function RecipientQuery({ mode, reduce, ...props }) {
  const present = useIsPresent();
  return <motion.div
    className={"recipient-query-panel" + (present ? "" : " leaving")}
    data-mode={mode}
    aria-hidden={!present}
    inert={!present ? "" : undefined}
    initial={{ opacity: 0, x: reduce ? 0 : mode === "card" ? 8 : -8 }}
    animate={{ opacity: 1, x: 0 }}
    exit={{ opacity: 0, x: reduce ? 0 : mode === "card" ? 8 : -8 }}
    transition={{ duration: reduce ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] }}
  >
    <Field
      {...props}
      id={present ? "recipient-query" : "recipient-query-leaving-" + mode}
      disabled={props.disabled || !present}
      error={present ? props.error : ""}
      onChange={event => present && props.onChange(event)}
      onBlur={() => present && props.onBlur()}
    />
  </motion.div>;
}
export function Send({
  balance,
  card,
  contacts,
  initialRecipient,
  onSend,
  onPickCard,
  blocked,
  accountId,
  membership,
  onRecipient,
}) {
  const { t, lang } = useLang();
  const w = (ru, en) => (lang === "en" ? en : ru);
  const reduce = useReducedMotion();
  const modeIndicator = useId();
  const [amount, setAmount] = useState("0");
  const [recipient, setRecipient] = useState(
    contacts.find((c) => c.id === initialRecipient) || null,
  );
  const [bankId, setBankId] = useState(
    recipientBank(recipient || {}) || "cardo",
  );
  const [mode, setMode] = useState(recipient?.lookupType || "phone");
  const [query, setQuery] = useState(contactQuery(recipient));
  const [queryTouched, setQueryTouched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const [customKeyboard, setCustomKeyboard] = useState(() =>
    window.matchMedia("(max-width: 620px), (pointer: coarse)").matches,
  );
  const [feeQuote, setFeeQuote] = useState(null);
  const [feeLoading, setFeeLoading] = useState(true);
  const [feeError, setFeeError] = useState("");
  const feeVersion = useRef(0);
  const lock = useRef(false),
    alive = useRef(true),
    searchVersion = useRef(0);
  const details = queryDetails(mode, query);
  const lookupIdentity = bankId + ":" + mode + ":" + details.digits;
  const selectedIdentity = useRef(recipient ? lookupIdentity : null);
  const amountInput = useRef(null);
  const focusTarget = useRef(recipient ? "amount" : null);
  const routeSelection = useRef({ id: initialRecipient, applied: !!recipient });
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      searchVersion.current += 1;
      feeVersion.current += 1;
    };
  }, []);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 620px), (pointer: coarse)");
    const changed = () => setCustomKeyboard(media.matches);
    media.addEventListener("change", changed);
    return () => media.removeEventListener("change", changed);
  }, []);
  const loadFee = useCallback(async () => {
    const version = ++feeVersion.current;
    setFeeLoading(true);
    setFeeError("");
    try {
      const value = await api.transferFee();
      if (
        value.currency !== "RUB" ||
        !["standard", "plus"].includes(value.plan) ||
        !/^\d+$/.test(value.feeMinor) ||
        !Number.isSafeInteger(Number(value.feeMinor)) ||
        Number(value.fee) * 100 !== Number(value.feeMinor)
      )
        throw new Error(
          lang === "en"
            ? "Unable to confirm the transfer fee"
            : "Не удалось подтвердить комиссию перевода",
        );
      if (alive.current && version === feeVersion.current)
        setFeeQuote({ ...value, accountId });
    } catch (error) {
      if (alive.current && version === feeVersion.current) {
        setFeeQuote(null);
        setFeeError(error.message);
      }
    } finally {
      if (alive.current && version === feeVersion.current) setFeeLoading(false);
    }
  }, [accountId, lang]);
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== "hidden" && navigator.onLine) loadFee();
    };
    loadFee();
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [loadFee, membership?.premium, membership?.expiresAt]);
  useEffect(() => {
    if (routeSelection.current.id !== initialRecipient) {
      routeSelection.current = { id: initialRecipient, applied: false };
      searchVersion.current += 1;
      selectedIdentity.current = null;
      setRecipient(null);
      setBankId("cardo");
      setQuery("");
      setQueryTouched(false);
      setSearching(false);
      setSearchError("");
      focusTarget.current = null;
    }
    if (routeSelection.current.applied || !initialRecipient) return;
    const found = contacts.find((c) => c.id === initialRecipient);
    if (found) choose(found);
    else
      setSearchError(
        w(
          "Получатель не найден. Введи его телефон или номер карты.",
          "Recipient not found. Enter their phone or card number.",
        ),
      );
  }, [initialRecipient, contacts]);
  useEffect(() => {
    const target = focusTarget.current;
    if (!target) return;
    const frame = requestAnimationFrame(() => {
      focusTarget.current = null;
      if (target === "amount") {
        amountInput.current?.focus({ preventScroll: true });
        if (amountInput.current?.value === "0") amountInput.current.select();
      } else
        document
          .getElementById("recipient-query")
          ?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [recipient?.id]);
  useEffect(() => {
    if (
      !details.complete ||
      blocked ||
      pending ||
      selectedIdentity.current === lookupIdentity
    )
      return;
    const version = ++searchVersion.current;
    const timer = setTimeout(async () => {
      if (!alive.current || version !== searchVersion.current) return;
      setSearching(true);
      setSearchError("");
      try {
        const found = await api.resolveRecipient(
          mode === "phone"
            ? { bankId, phone: "+" + details.digits }
            : { bankId, cardNumber: details.digits },
        );
        if (!alive.current || version !== searchVersion.current) return;
        selectedIdentity.current = lookupIdentity;
        routeSelection.current.applied = true;
        setRecipient(found);
        setSearchError("");
        setError("");
        setUncertain(false);
        onRecipient(found);
      } catch (error) {
        if (!alive.current || version !== searchVersion.current) return;
        setRecipient(null);
        setSearchError(
          error.status === 404
            ? w("Получатель не найден", "Recipient not found")
            : error.message,
        );
      } finally {
        if (alive.current && version === searchVersion.current)
          setSearching(false);
      }
    }, 400);
    return () => {
      clearTimeout(timer);
      if (version === searchVersion.current) searchVersion.current += 1;
    };
  }, [lookupIdentity, query, details.complete, blocked, pending]);
  const queryError =
    searchError ||
    (queryTouched && query.trim() && !details.complete
      ? mode === "phone"
        ? w(
            "Введи 11 цифр номера, начиная с 7 или 8",
            "Enter 11 phone digits starting with 7 or 8",
          )
        : w("Введи 16 цифр номера карты", "Enter the 16-digit card number")
      : "");
  const num = Number(amount);
  const registered =
    recipient?.kind === "registered" && !!recipient.targetUserId;
  const external =
    recipient?.kind === "external" &&
    recipient.targetUserId === null &&
    recipient.bankId !== "cardo" &&
    !!recipient.bankId;
  const validRecipient =
    (registered || external) && selectedIdentity.current === lookupIdentity;
  const payload = {
    cardId: card.id,
    recipientId: recipient?.id,
    amount: num.toFixed(2),
  };
  const retry =
    validRecipient && !!savedAttempt(accountId, "transfer", payload);
  const amountMinor = Math.round(num * 100);
  const confirmedFee = feeQuote?.accountId === accountId ? feeQuote : null;
  const feeMinor = confirmedFee ? Number(confirmedFee.feeMinor) : null;
  const totalDebitMinor = feeMinor === null ? null : amountMinor + feeMinor;
  const insufficient =
    num > 0 &&
    totalDebitMinor !== null &&
    totalDebitMinor > (card.balanceMinor ?? Math.round(balance * 100)) &&
    !retry;
  const feeUnavailable = (feeLoading || !!feeError || !confirmedFee) && !retry;
  const wrongCurrency = validRecipient && recipient.currency !== "RUB";
  const unavailable = card.frozen || card.code !== "RUB" || wrongCurrency;
  function press(k) {
    if (pending || blocked) return;
    setError("");
    setUncertain(false);
    setAmount((a) => {
      if (k === "del") return a.length <= 1 ? "0" : a.slice(0, -1);
      if (k === ".") return a.includes(".") ? a : (a || "0") + ".";
      if (a.length >= 10 || (a.includes(".") && a.split(".")[1].length >= 2))
        return a;
      return a === "0" ? k : a + k;
    });
  }
  function editAmount(value) {
    if (pending || blocked) return;
    let next = value.replace(/\s/g, "").replace(",", ".");
    if (next.startsWith(".")) next = "0" + next;
    if (next.length > 10 || !/^\d*(?:\.\d{0,2})?$/.test(next)) return;
    setAmount(next);
    setError("");
    setUncertain(false);
  }
  function choose(c) {
    const nextBank = recipientBank(c) || "cardo";
    const nextMode =
      c.lookupType ||
      (contactQuery(c).replace(/\D/g, "").length === 16 ? "card" : "phone");
    const nextQuery = contactQuery(c);
    searchVersion.current += 1;
    selectedIdentity.current =
      nextBank +
      ":" +
      nextMode +
      ":" +
      queryDetails(nextMode, nextQuery).digits;
    routeSelection.current.applied = true;
    focusTarget.current = "amount";
    setBankId(nextBank);
    setMode(nextMode);
    setQuery(nextQuery);
    setQueryTouched(false);
    setSearching(false);
    setRecipient(c);
    setError("");
    setUncertain(false);
    setSearchError("");
  }
  function clearSelection() {
    searchVersion.current += 1;
    selectedIdentity.current = null;
    routeSelection.current.applied = true;
    focusTarget.current = null;
    setRecipient(null);
    setSearching(false);
    setSearchError("");
    setQueryTouched(false);
    setError("");
    setUncertain(false);
  }
  function selectMode(value) {
    if (pending || blocked || mode === value) return;
    clearSelection();
    setBankId("cardo");
    setMode(value);
    setQuery("");
  }
  function editQuery(value) {
    if (pending || blocked) return;
    clearSelection();
    setBankId("cardo");
    setQuery(value);
  }
  async function submit() {
    if (
      lock.current ||
      blocked ||
      num <= 0 ||
      !validRecipient ||
      insufficient ||
      feeUnavailable ||
      unavailable
    )
      return;
    lock.current = true;
    setPending(true);
    setError("");
    const key = operationKey(accountId, "transfer", payload);
    try {
      const result = await onSend(payload.amount, recipient, key);
      if (result.ok || !result.uncertain)
        clearAttempt(accountId, "transfer", payload);
      if (!alive.current) return;
      if (result.ok) {
        setAmount("0");
        setUncertain(false);
      } else {
        setUncertain(!!result.uncertain);
        setError(result.message || "");
        loadFee();
      }
    } finally {
      lock.current = false;
      if (alive.current) setPending(false);
    }
  }
  useEffect(() => {
    function onKey(e) {
      if (
        blocked ||
        pending ||
        e.target.closest("input,textarea,select,button")
      )
        return;
      if (/^[0-9]$/.test(e.key)) press(e.key);
      else if (e.key === "." || e.key === ",") press(".");
      else if (e.key === "Backspace") {
        e.preventDefault();
        press("del");
      } else if (e.key === "Enter") submit();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    amount,
    recipient,
    card.id,
    balance,
    pending,
    blocked,
    feeQuote,
    feeLoading,
    feeError,
  ]);
  return (
    <div className="send anim">
      <h1 className="send-h">{t("send.title")}</h1>
      <section
        className={
          "recipient-search" +
          (searching
            ? " searching"
            : recipient && validRecipient
              ? " found"
              : queryError
                ? " invalid"
                : "")
        }
        aria-label={w("Получатель", "Recipient")}
        aria-busy={searching}
      >
        <div className="soft-head">
          <span>{w("Получатель", "Recipient")}</span>
        </div>
        <div className="seg recipient-mode">
          {["phone", "card"].map((value) => (
            <button
              type="button"
              key={value}
              className={mode === value ? "on" : ""}
              aria-pressed={mode === value}
              disabled={pending || blocked}
              onClick={() => selectMode(value)}
            >
              {mode === value && <motion.span
                className="recipient-mode-indicator"
                layoutId={modeIndicator}
                transition={{ type: "tween", duration: reduce ? 0 : 0.24, ease: [0.22, 1, 0.36, 1] }}
                aria-hidden="true"
              />}
              <span className="recipient-mode-content">{value === "phone"
                ? w("По телефону", "By phone")
                : w("По карте", "By card")}
              {value === "phone" && (
                <img
                  className="recipient-sbp-mark"
                  src="/banks/sbp.svg"
                  width="18"
                  height="18"
                  alt=""
                  aria-hidden="true"
                />
              )}</span>
            </button>
          ))}
        </div>
        <div className="recipient-form recipient-form-auto">
          <AnimatePresence initial={false}>
          <RecipientQuery
            key={mode}
            mode={mode}
            reduce={reduce}
            title={
              mode === "phone"
                ? w("Номер телефона", "Phone number")
                : w("Номер карты", "Card number")
            }
            inputMode={mode === "phone" ? "tel" : "numeric"}
            autoComplete={mode === "phone" ? "tel" : "off"}
            placeholder={
              mode === "phone" ? "+7 999 123-45-67" : "0000 0000 0000 0000"
            }
            value={query}
            maxLength={24}
            disabled={pending || blocked}
            onChange={(event) => editQuery(event.target.value)}
            onBlur={() => setQueryTouched(true)}
            error={queryError}
          />
          </AnimatePresence>
        </div>
        {searching && (
          <div className="recipient-search-status" role="status">
            <span className="spinner" />
            {w("Ищем получателя…", "Finding recipient…")}
          </div>
        )}
        {recipient && validRecipient && (
          <div className="recipient-found" role="status">
            <RecipientAvatar recipient={recipient} />
            <div className="recipient-found-copy">
              <strong>{recipient.name}</strong>
              <span>{recipient.acct}</span>
              <span className="recipient-bank-name">
                {bankName(recipientBank(recipient), recipient.bankName)}
              </span>
            </div>
            <Icon name="check" size={18} />
          </div>
        )}
        {!recipient && !!contacts.length && (
          <>
            <div className="send-row-l saved-recipients-label">
              {w("Сохранённые получатели", "Saved recipients")}
            </div>
            <ScrollRow>
              {contacts.map((contact) => (
                <button
                  className="person"
                  key={contact.id}
                  disabled={pending || blocked}
                  onClick={() => choose(contact)}
                  title={
                    contact.name +
                    " · " +
                    bankName(recipientBank(contact), contact.bankName) +
                    " · " +
                    contact.acct
                  }
                  aria-label={
                    w("Перевести: ", "Send to: ") +
                    contact.name +
                    " · " +
                    bankName(recipientBank(contact), contact.bankName) +
                    " · " +
                    contact.acct
                  }
                >
                  <RecipientAvatar recipient={contact} />
                  <span className="person-n">{contact.name}</span>
                  <span className="recipient-reference">
                    {bankName(recipientBank(contact), contact.bankName)}
                  </span>
                  <span className="recipient-reference">
                    {maskedRecipientReference(contact)}
                  </span>
                </button>
              ))}
            </ScrollRow>
          </>
        )}
      </section>
      <div className="amount-wrap">
        <label className="send-amount-label" htmlFor="send-amount">
          {w("Сумма перевода", "Transfer amount")}
        </label>
        <div className={"amount" + (amount.length > 7 ? " compact" : "")}>
          <span className="amount-cur">{card.cur}</span>
          <input
            ref={amountInput}
            id="send-amount"
            className="send-amount-input"
            type="text"
            inputMode={customKeyboard ? "none" : "decimal"}
            readOnly={customKeyboard}
            autoComplete="off"
            aria-describedby={
              "send-amount-help" + (insufficient ? " send-amount-error" : "")
            }
            aria-controls={customKeyboard ? "send-keypad" : undefined}
            aria-description={
              customKeyboard
                ? w("Введи сумму клавиатурой ниже", "Use the amount keypad below")
                : undefined
            }
            aria-invalid={insufficient}
            value={amount.replace(".", lang === "en" ? "." : ",")}
            placeholder="0"
            maxLength={10}
            disabled={pending || blocked}
            style={{ width: Math.max(amount.length, 1) + 0.3 + "ch" }}
            onChange={(e) => editAmount(e.target.value)}
            onBlur={() => {
              if (!amount) setAmount("0");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
          />
        </div>
        <div className="amount-sub" id="send-amount-help">
          {t("send.available", { amount: money(balance, card.cur) })}
        </div>
      </div>
      <button className="cardrow" onClick={onPickCard} disabled={pending}>
        <span
          className={
            "cardrow-mini tone-" + card.tone + (card.frozen ? " frozen" : "")
          }
        >
          Cardo
        </span>
        <div className="cardrow-m">
          <div className="cardrow-n">
            {t("common.card")} •• {card.num}
          </div>
          <div className="cardrow-s">
            {t("send.cardBal", { amount: money(balance, card.cur) })}
          </div>
        </div>
        <span className="cardrow-change">{t("send.change")}</span>
      </button>
      <ValidationMessage
        message={
          unavailable
            ? card.frozen
              ? w(
                  "Карта заморожена. Выбери другую или разморозь её.",
                  "This card is frozen. Choose another or unfreeze it.",
                )
              : wrongCurrency
                ? w(
                    "Для перевода нужна рублёвая карта получателя. Найди его по телефону.",
                    "A RUB recipient card is required. Find the recipient by phone.",
                  )
                : w(
                    "Для перевода выбери рублёвую карту.",
                    "Choose a RUB card for the transfer.",
                  )
            : ""
        }
      />
      <ValidationMessage
        id="send-amount-error"
        message={
          insufficient
            ? w(
                "Недостаточно средств с учётом комиссии. Пополни счёт или измени сумму.",
                "Insufficient funds including the fee. Top up or change the amount.",
              )
            : ""
        }
      />
      <div
        className="keypad"
        id="send-keypad"
        role="group"
        aria-label={w("Клавиатура для суммы перевода", "Transfer amount keypad")}
      >
        {KEYS.map((k) => (
          <button
            disabled={pending || blocked}
            key={k}
            className={"key" + (k === "del" ? " key-del" : "")}
            onClick={() => press(k)}
            aria-label={k === "del" ? w("Удалить цифру", "Delete digit") : k}
          >
            {k === "del" ? <Icon name="backspace" size={20} /> : k}
          </button>
        ))}
      </div>
      <ValidationMessage message={error} />
      {uncertain && (
        <p className="field-help">
          {w(
            "Ответ не получен. Повтори с той же суммой и получателем, чтобы проверить перевод.",
            "No response received. Retry the same amount and recipient to check this transfer.",
          )}
        </p>
      )}
      <div className="transfer-cost" aria-live="polite" aria-busy={feeLoading}>
        <ValidationMessage message={feeError} />
        {feeLoading || (!confirmedFee && !feeError) ? (
          <div className="transfer-cost-status" role="status">
            <span className="spinner" />
            {w("Уточняем комиссию…", "Checking the fee…")}
          </div>
        ) : feeError ? (
          <div className="transfer-cost-error">
            <button
              type="button"
              className="soft-link"
              disabled={pending || blocked}
              onClick={loadFee}
            >
              {w("Попробовать снова", "Try again")}
            </button>
          </div>
        ) : (
          <>
            <div className="transfer-cost-row">
              <span>{w("Комиссия", "Fee")}</span>
              <strong>{money(feeMinor / 100, "₽")}</strong>
            </div>
            {num > 0 && (
              <div className="transfer-cost-row total">
                <span>{w("Всего к списанию", "Total debit")}</span>
                <strong>{money(totalDebitMinor / 100, "₽")}</strong>
              </div>
            )}
          </>
        )}
      </div>
      <button
        className="btn-dark send-btn"
        disabled={
          pending ||
          blocked ||
          num <= 0 ||
          !validRecipient ||
          insufficient ||
          feeUnavailable ||
          unavailable
        }
        onClick={submit}
      >
        {pending
          ? w("Отправляем…", "Sending…")
          : uncertain
            ? w("Проверить перевод", "Check transfer")
            : t("common.send")}
        {!pending && !uncertain && num > 0 ? " " + money(num, card.cur) : ""}
      </button>
    </div>
  );
}
