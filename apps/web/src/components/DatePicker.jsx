import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Icon from "../icons.jsx";
import ValidationMessage from "./ValidationMessage.jsx";
import "./date-picker.css";

const dateAt = (year, month, day = 1) => new Date(Date.UTC(year, month, day));
const iso = (date) => date.toISOString().slice(0, 10);
const parse = (value) => new Date(value + "T00:00:00Z");
const monthAt = (date) => dateAt(date.getUTCFullYear(), date.getUTCMonth());
const daysIn = (year, month) => dateAt(year, month + 1, 0).getUTCDate();
const clamp = (value, min, max) => (value < min ? min : value > max ? max : value);
const shiftMonth = (date, amount) => {
  const month = dateAt(date.getUTCFullYear(), date.getUTCMonth() + amount);
  return dateAt(month.getUTCFullYear(), month.getUTCMonth(), Math.min(date.getUTCDate(), daysIn(month.getUTCFullYear(), month.getUTCMonth())));
};

export function birthDateBounds(today = new Date()) {
  const year = today.getUTCFullYear(), month = today.getUTCMonth(), day = today.getUTCDate();
  const oldest = dateAt(year - 111, month, Math.min(day, daysIn(year - 111, month)) + 1);
  return { min: iso(oldest), max: iso(dateAt(year - 14, month, Math.min(day, daysIn(year - 14, month)))) };
}

export default function DatePicker({ id, title, value, onChange, error, min, max, lang = "ru", disabled = false }) {
  const panelId = useId();
  const wrapper = useRef(null), trigger = useRef(null), panel = useRef(null);
  const [open, setOpen] = useState(false), [view, setView] = useState("days");
  const initial = value || max;
  const [month, setMonth] = useState(() => monthAt(parse(initial))), [focusDate, setFocusDate] = useState(initial);
  const reduce = useReducedMotion(), locale = lang === "en" ? "en-GB" : "ru-RU";
  const w = (ru, en) => lang === "en" ? en : ru;
  const year = month.getUTCFullYear(), monthIndex = month.getUTCMonth();
  const format = (date, options) => new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC" }).format(date);
  const monthName = (index) => format(dateAt(2024, index), { month: "long" });
  const years = Array.from({ length: parse(max).getUTCFullYear() - parse(min).getUTCFullYear() + 1 }, (_, i) => parse(max).getUTCFullYear() - i);
  const offset = (month.getUTCDay() + 6) % 7;
  const days = Array.from({ length: Math.ceil((offset + daysIn(year, monthIndex)) / 7) * 7 }, (_, i) => dateAt(year, monthIndex, i - offset + 1));
  const availableMonth = (target) => iso(dateAt(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)) >= min && iso(target) <= max;

  useEffect(() => {
    if (!open) return;
    const outside = (event) => {
      if (!wrapper.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      const target = panel.current?.querySelector('[data-calendar-focus="true"]');
      target?.focus({ preventScroll: true });
      if (view === "years") target?.scrollIntoView({ block: "nearest" });
    });
    return () => cancelAnimationFrame(frame);
  }, [open, view, month, focusDate]);

  function close() {
    setOpen(false);
    trigger.current?.focus();
  }
  function toggle() {
    if (open) return close();
    const selected = clamp(value || max, min, max);
    setMonth(monthAt(parse(selected)));
    setFocusDate(selected);
    setView("days");
    setOpen(true);
  }
  function choose(selected) {
    onChange(selected);
    close();
  }
  function navigate(amount) {
    const selected = clamp(iso(shiftMonth(parse(focusDate), amount)), min, max);
    setMonth(monthAt(parse(selected)));
    setFocusDate(selected);
    setView("days");
  }
  function dayKey(event, selected) {
    const steps = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    let target;
    if (event.key in steps) {
      const date = parse(selected);
      date.setUTCDate(date.getUTCDate() + steps[event.key]);
      target = date;
    } else if (event.key === "Home" || event.key === "End") {
      const date = parse(selected), weekday = (date.getUTCDay() + 6) % 7;
      date.setUTCDate(date.getUTCDate() + (event.key === "Home" ? -weekday : 6 - weekday));
      target = date;
    } else if (event.key === "PageUp" || event.key === "PageDown") {
      target = shiftMonth(parse(selected), (event.key === "PageUp" ? -1 : 1) * (event.shiftKey ? 12 : 1));
    }
    if (!target) return;
    event.preventDefault();
    const next = clamp(iso(target), min, max);
    setMonth(monthAt(parse(next)));
    setFocusDate(next);
  }
  function setPeriod(nextYear, nextMonth) {
    const next = clamp(iso(dateAt(nextYear, nextMonth, Math.min(parse(focusDate).getUTCDate(), daysIn(nextYear, nextMonth)))), min, max);
    setMonth(monthAt(parse(next)));
    setFocusDate(next);
    setView("days");
  }

  return (
    <div ref={wrapper} className={"fld cardo-date" + (error ? " err" : "")} onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }} onKeyDown={(event) => {
      if (event.key === "Escape" && open) {
        event.preventDefault();
        event.stopPropagation();
        close();
      }
    }}>
      <label htmlFor={id}>{title}</label>
      <button ref={trigger} id={id} type="button" className="cardo-date-trigger" disabled={disabled} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? panelId : undefined} aria-invalid={!!error} aria-describedby={error ? id + "-error" : undefined} onClick={toggle}>
        <span className={!value ? "cardo-date-placeholder" : ""}>{value ? format(parse(value), { day: "2-digit", month: "2-digit", year: "numeric" }) : w("ДД.ММ.ГГГГ", "DD/MM/YYYY")}</span>
        <Icon name="calendar" size={19} />
      </button>
      <AnimatePresence initial={false}>
        {open && <motion.div className="cardo-calendar-wrap" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: reduce ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}>
          <div ref={panel} id={panelId} className="cardo-calendar" role="dialog" aria-label={w("Выбор даты рождения", "Choose date of birth")} data-cardo-popover="true">
            <div className="cardo-calendar-head">
              <button type="button" className="cardo-calendar-nav" aria-label={w("Предыдущий месяц", "Previous month")} disabled={!availableMonth(dateAt(year, monthIndex - 1))} onClick={() => navigate(-1)}><Icon name="chevronl" size={18} /></button>
              <div className="cardo-calendar-period">
                <button type="button" aria-label={w("Выбрать месяц", "Choose month")} aria-expanded={view === "months"} onClick={() => setView(view === "months" ? "days" : "months")}>{monthName(monthIndex)}<Icon name="chevrond" size={13} /></button>
                <button type="button" aria-label={w("Выбрать год", "Choose year")} aria-expanded={view === "years"} onClick={() => setView(view === "years" ? "days" : "years")}>{year}<Icon name="chevrond" size={13} /></button>
              </div>
              <button type="button" className="cardo-calendar-nav" aria-label={w("Следующий месяц", "Next month")} disabled={!availableMonth(dateAt(year, monthIndex + 1))} onClick={() => navigate(1)}><Icon name="chevronr" size={18} /></button>
            </div>
            <motion.div key={view + year + monthIndex} initial={{ opacity: reduce ? 1 : 0 }} animate={{ opacity: 1 }} transition={{ duration: reduce ? 0 : 0.16 }}>
            {view === "days" ? <>
              <div className="cardo-calendar-weekdays" aria-hidden="true">{Array.from({ length: 7 }, (_, i) => <span key={i}>{format(dateAt(2024, 0, i + 8), { weekday: "short" })}</span>)}</div>
              <div className="cardo-calendar-days" role="group" aria-label={format(month, { month: "long", year: "numeric" })}>
                {days.map((date) => {
                  const selected = iso(date), available = selected >= min && selected < max;
                  return <button type="button" key={selected} className={"cardo-calendar-day" + (date.getUTCMonth() !== monthIndex ? " outside" : "") + (value === selected ? " chosen" : "")} disabled={!available} tabIndex={selected === focusDate ? 0 : -1} data-calendar-focus={selected === focusDate} aria-label={format(date, { day: "numeric", month: "long", year: "numeric" })} aria-pressed={value === selected} onFocus={() => setFocusDate(selected)} onKeyDown={(event) => dayKey(event, selected)} onClick={() => choose(selected)}>{date.getUTCDate()}</button>;
                })}
              </div>
            </> : <div className={"cardo-calendar-options " + view} role="group" aria-label={view === "months" ? w("Месяцы", "Months") : w("Годы", "Years")}>
              {(view === "months" ? Array.from({ length: 12 }, (_, i) => i) : years).map((item) => {
                const selected = item === (view === "months" ? monthIndex : year);
                return <button type="button" key={item} className={selected ? "chosen" : ""} data-calendar-focus={selected} aria-pressed={selected} disabled={view === "months" && !availableMonth(dateAt(year, item))} onClick={() => view === "months" ? setPeriod(year, item) : setPeriod(item, monthIndex)}>{view === "months" ? monthName(item) : item}</button>;
              })}
            </div>}
            </motion.div>
            <div className="cardo-calendar-foot"><span>{w("Возраст от 14 до 110 лет", "Ages 14 to 110")}</span><button type="button" disabled={!value} onClick={() => choose("")}>{w("Очистить", "Clear")}</button></div>
          </div>
        </motion.div>}
      </AnimatePresence>
      <ValidationMessage id={id + "-error"} className="fld-err" message={error} />
    </div>
  );
}
