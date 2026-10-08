import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Icon from "../icons.jsx";
import "./select-field.css";

export default function SelectField({ id, title, value, options, onChange, disabled = false, placeholder = "—" }) {
  const generated = useId();
  const fieldId = id || "select-" + generated;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef(null);
  const trigger = useRef(null);
  const optionRefs = useRef([]);
  const search = useRef({ text: "", at: 0 });
  const reduce = useReducedMotion();
  const selected = options.find(option => option.value === value);
  const first = options.findIndex(option => !option.disabled);
  const canOpen = !disabled && first >= 0;

  function close(restore = false) {
    setOpen(false);
    if (restore) requestAnimationFrame(() => trigger.current?.focus());
  }
  function show(last = false) {
    if (!canOpen) return;
    const selectedIndex = options.findIndex(option => option.value === value && !option.disabled);
    const lastIndex = options.findLastIndex(option => !option.disabled);
    setActive(selectedIndex >= 0 ? selectedIndex : last ? lastIndex : first);
    setOpen(true);
  }
  function choose(option) {
    if (option.disabled || disabled) return;
    onChange(option.value);
    close(true);
  }
  function step(direction) {
    for (let offset = 1; offset <= options.length; offset++) {
      const index = (active + direction * offset + options.length) % options.length;
      if (!options[index].disabled) { setActive(index); return; }
    }
  }
  useEffect(() => {
    if (!open) return;
    const pointer = event => {
      if (!root.current?.contains(event.target)) close();
    };
    document.addEventListener("pointerdown", pointer);
    return () => document.removeEventListener("pointerdown", pointer);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    optionRefs.current[active]?.focus({ preventScroll: true });
    optionRefs.current[active]?.scrollIntoView({ block: "nearest" });
  }, [open, active]);
  useEffect(() => {
    if (!canOpen) setOpen(false);
  }, [canOpen]);

  function keys(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      step(event.key === "ArrowDown" ? 1 : -1);
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      setActive(event.key === "Home" ? first : options.findLastIndex(option => !option.disabled));
    } else if (event.key === "Tab") {
      event.preventDefault();
      const scope = root.current.closest('[role="dialog"]') || document;
      const controls = [...scope.querySelectorAll('button:not(:disabled),input:not(:disabled),[tabindex="0"]')]
        .filter(node => !node.closest('[data-cardo-popover="true"]') && node.getClientRects().length);
      const index = controls.indexOf(trigger.current);
      const target = controls[(index + (event.shiftKey ? -1 : 1) + controls.length) % controls.length];
      close();
      requestAnimationFrame(() => target?.focus());
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey && event.key !== " ") {
      const now = Date.now();
      search.current.text = (now - search.current.at < 700 ? search.current.text : "") + event.key.toLocaleLowerCase();
      search.current.at = now;
      const index = options.findIndex(option => !option.disabled && option.label.toLocaleLowerCase().startsWith(search.current.text));
      if (index >= 0) setActive(index);
    }
  }
  function content(option) {
    return <>
      {option?.icon && <span className="select-field-icon">{option.icon}</span>}
      <span className="select-field-copy">
        <span className="select-field-value">{option?.label || placeholder}</span>
        {option?.description && <span className="select-field-description">{option.description}</span>}
      </span>
    </>;
  }
  return (
    <div className="select-field" ref={root}>
      <label id={fieldId + "-label"} htmlFor={fieldId}>{title}</label>
      <button
        ref={trigger}
        id={fieldId}
        type="button"
        role="combobox"
        className={"select-field-trigger" + (open ? " expanded" : "")}
        aria-labelledby={fieldId + "-label"}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? fieldId + "-list" : undefined}
        disabled={!canOpen}
        onClick={() => open ? close() : show()}
        onKeyDown={event => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            show(event.key === "ArrowUp");
          }
        }}
      >
        {content(selected)}
        <Icon name="chevrond" size={18} className="select-field-chevron" />
      </button>
      <AnimatePresence>
        {open && <motion.div
          id={fieldId + "-list"}
          role="listbox"
          aria-labelledby={fieldId + "-label"}
          className="select-field-menu"
          data-cardo-popover="true"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: reduce ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] }}
          onKeyDown={keys}
        >
          <div className="select-field-options">
            {options.map((option, index) => <button
              key={option.value}
              ref={node => optionRefs.current[index] = node}
              type="button"
              role="option"
              aria-selected={value === option.value}
              disabled={option.disabled}
              tabIndex={-1}
              className={"select-field-option" + (value === option.value ? " selected" : "")}
              onFocus={() => setActive(index)}
              onClick={() => choose(option)}
            >
              {content(option)}
              {value === option.value && <Icon name="check" size={18} />}
            </button>)}
          </div>
        </motion.div>}
      </AnimatePresence>
    </div>
  );
}
