import { AnimatePresence, motion, useReducedMotion } from "motion/react";

export default function ValidationMessage({ message, id, className = "form-error" }) {
  const reduce = useReducedMotion();
  return (
    <AnimatePresence initial={false}>
      {message && (
        <motion.div
          key="validation"
          className="validation-message"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: reduce ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
        >
          <p id={id} className={className} role="alert">{message}</p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
