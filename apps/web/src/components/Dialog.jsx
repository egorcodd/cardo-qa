import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Icon from "../icons.jsx";
export default function Dialog({
  open,
  onClose,
  title,
  children,
  className = "",
  busy = false,
}) {
  const panel = useRef(null);
  const close = useRef(onClose);
  close.current = onClose;
  const reduce = useReducedMotion();
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement;
    const root = document.getElementById("root");
    const oldInert = root.inert;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    root.inert = true;
    const frame = requestAnimationFrame(() =>
      (panel.current?.querySelector("input,button") || panel.current)?.focus(),
    );
    const key = (e) => {
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        if (!busy) close.current();
      }
      if (e.key !== "Tab") return;
      const controls = [
        ...(panel.current?.querySelectorAll(
          'button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]',
        ) || []),
      ];
      if (!controls.length) {
        e.preventDefault();
        return;
      }
      const first = controls[0],
        last = controls.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
      if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", key, true);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", key, true);
      document.body.style.overflow = overflow;
      root.inert = oldInert;
      if (previous?.isConnected) previous.focus();
    };
  }, [open, busy]);
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="design-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduce ? 0 : 0.18 }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !busy) onClose();
          }}
        >
          <motion.section
            ref={panel}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className={"design-sheet " + className}
            initial={{
              opacity: 0,
              y: reduce ? 0 : 16,
              scale: reduce ? 1 : 0.97,
            }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: reduce ? 0 : 8, scale: reduce ? 1 : 0.98 }}
            transition={{
              duration: reduce ? 0 : 0.25,
              ease: [0.22, 1, 0.36, 1],
            }}
          >
            <div className="sheet-head">
              <h2>{title}</h2>
              <button
                className="m-x"
                type="button"
                aria-label="Закрыть / Close"
                onClick={onClose}
                disabled={busy}
              >
                <Icon name="close" size={17} />
              </button>
            </div>
            {children}
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
