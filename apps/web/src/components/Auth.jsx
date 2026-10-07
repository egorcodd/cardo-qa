import { useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { api } from "../api.js";
import { useLang } from "../i18n.jsx";
import Icon, { BrandMark } from "../icons.jsx";
import "../auth.css";
const digits = (value) => {
  let d = value.replace(/\D/g, "");
  if (d.length > 10 && /^[78]/.test(d)) d = d.slice(1);
  return d.slice(0, 10);
};
const mask = (d) =>
  d.length
    ? "(" +
      d.slice(0, 3) +
      (d.length > 3 ? ") " + d.slice(3, 6) : "") +
      (d.length > 6 ? "-" + d.slice(6, 8) : "") +
      (d.length > 8 ? "-" + d.slice(8) : "")
    : "";
const passwordValid = (p) =>
  p.length >= 8 &&
  p.length <= 72 &&
  /\p{L}/u.test(p) &&
  /\d/.test(p) &&
  !/\s/.test(p);
function AuthField({
  id,
  label,
  error,
  value,
  onChange,
  type = "text",
  children,
  ...rest
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className={"fld" + (error ? " err" : "")}>
      <label htmlFor={id}>{label}</label>
      <div className={"fld-box" + (type === "password" ? " has-btn" : "")}>
        {type === "tel" && <span className="fld-pre">+7</span>}
        <input
          id={id}
          type={type === "password" && visible ? "text" : type}
          value={value}
          onChange={onChange}
          aria-invalid={!!error}
          aria-describedby={error ? id + "-error" : undefined}
          {...rest}
        />
        {type === "password" && (
          <button
            type="button"
            className="fld-eye"
            aria-label={
              visible
                ? "Скрыть пароль / Hide password"
                : "Показать пароль / Show password"
            }
            onClick={() => setVisible(!visible)}
          >
            <Icon name={visible ? "eyeoff" : "eye"} size={18} />
          </button>
        )}
      </div>
      {error && (
        <p id={id + "-error"} className="fld-err" role="alert">
          {error}
        </p>
      )}
      {children}
    </div>
  );
}
export default function Auth({ onAuth }) {
  const { lang, setLang } = useLang(),
    w = (ru, en) => (lang === "en" ? en : ru),
    reduce = useReducedMotion();
  const [mode, setMode] = useState("login"),
    [phone, setPhone] = useState(""),
    [name, setName] = useState(""),
    [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [agree, setAgree] = useState(false),
    [errors, setErrors] = useState({}),
    [serverError, setServerError] = useState(""),
    [pending, setPending] = useState(false);
  const lock = useRef(false),
    register = mode === "register";
  const strength = password
    ? Math.max(
        1,
        Number(password.length >= 8) +
          Number(/\p{L}/u.test(password) && /\d/.test(password)) +
          Number(/[A-ZА-ЯЁ]/.test(password) && /[a-zа-яё]/.test(password)) +
          Number(/[^\p{L}\d]/u.test(password) || password.length >= 12),
      )
    : 0;
  function changeMode(m) {
    if (pending || m === mode) return;
    setMode(m);
    setPassword("");
    setConfirmation("");
    setErrors({});
    setServerError("");
    setAgree(false);
  }
  function clear(key) {
    setErrors((e) => ({ ...e, [key]: "" }));
    setServerError("");
  }
  function validate() {
    const next = {};
    if (!/^9\d{9}$/.test(digits(phone)))
      next.phone = w(
        "Введите мобильный номер полностью: 10 цифр после +7",
        "Enter all 10 mobile number digits after +7",
      );
    if (register && !/^[\p{L}\p{M} '\-]{2,60}$/u.test(name.trim()))
      next.name = w(
        "Введите имя и фамилию, от 2 до 60 букв",
        "Enter a name using 2 to 60 letters",
      );
    if (!password) next.password = w("Введите пароль", "Enter your password");
    else if (register && !passwordValid(password))
      next.password = w(
        "От 8 до 72 символов, буква и цифра, без пробелов",
        "8 to 72 characters, a letter and a digit, no spaces",
      );
    if (register && confirmation !== password)
      next.confirmation = w("Пароли не совпадают", "Passwords do not match");
    setErrors(next);
    return Object.keys(next).length === 0;
  }
  async function submit(e) {
    e.preventDefault();
    if (lock.current || !validate() || (register && !agree)) return;
    lock.current = true;
    setPending(true);
    setServerError("");
    try {
      const values = {
        phone: "+7" + digits(phone),
        password,
        ...(register
          ? { name: name.trim(), confirmPassword: confirmation }
          : {}),
      };
      const response = register
        ? await api.register(values)
        : await api.login(values);
      await onAuth(response.user);
    } catch (e) {
      setServerError(e.message);
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  return (
    <main className="screen-auth">
      <section className="screen-auth-card">
        <div className="screen-auth-heading">
          <div className="screen-auth-brand">
            <BrandMark />
            Cardo
          </div>
          <div
            className="seg auth-languages"
            aria-label={w("Язык", "Language")}
          >
            {["ru", "en"].map((l) => (
              <button
                key={l}
                type="button"
                className={lang === l ? "on" : ""}
                onClick={() => setLang(l)}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        <span className="badge-lime screen-auth-eyebrow">
          {w(
            "Учебный стенд для тестировщиков",
            "Practice environment for testers",
          )}
        </span>
        <h1 className="screen-auth-title">
          {register
            ? w("Откройте Cardo за минуту", "Open Cardo in a minute")
            : w("С возвращением", "Welcome back")}
        </h1>
        <p className="screen-auth-lead">
          {register
            ? w(
                "Нужны только имя, номер телефона и пароль. Карта появится сразу после регистрации.",
                "You only need a name, phone number and password. Your card appears after registration.",
              )
            : w(
                "Войдите по номеру телефона и паролю.",
                "Sign in with your phone number and password.",
              )}
        </p>
        <motion.div
          layout={!reduce}
          className="screen-auth-box"
          transition={{ duration: reduce ? 0 : 0.25, ease: [0.22, 1, 0.36, 1] }}
        >
          <div
            className="seg auth-mode-tabs"
            role="tablist"
            aria-label={w("Вход или регистрация", "Sign in or register")}
          >
            {["login", "register"].map((m) => (
              <button
                key={m}
                id={"tab-" + m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                aria-controls="auth-form"
                className={mode === m ? "on" : ""}
                disabled={pending}
                onClick={() => changeMode(m)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                    e.preventDefault();
                    changeMode(mode === "login" ? "register" : "login");
                  }
                }}
              >
                {m === "login"
                  ? w("Вход", "Sign in")
                  : w("Регистрация", "Register")}
              </button>
            ))}
          </div>
          <AnimatePresence mode="wait" initial={false}>
            <motion.form
              key={mode}
              id="auth-form"
              role="tabpanel"
              aria-labelledby={"tab-" + mode}
              onSubmit={submit}
              noValidate
              className="screen-auth-form"
              initial={{ opacity: 0, y: reduce ? 0 : 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: reduce ? 0 : -4 }}
              transition={{ duration: reduce ? 0 : 0.15 }}
            >
              {serverError && (
                <div className="alert" role="alert">
                  <Icon name="help" size={18} />
                  <span>{serverError}</span>
                </div>
              )}
              {register && (
                <AuthField
                  id="auth-name"
                  label={w("Имя и фамилия", "Full name")}
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    clear("name");
                  }}
                  error={errors.name}
                  autoComplete="name"
                  placeholder={w("Как в паспорте", "Your full name")}
                  maxLength={60}
                  disabled={pending}
                />
              )}
              <AuthField
                id="auth-phone"
                label={w("Номер телефона", "Phone number")}
                type="tel"
                value={phone}
                onChange={(e) => {
                  setPhone(mask(digits(e.target.value)));
                  clear("phone");
                }}
                error={errors.phone}
                autoComplete="tel-national"
                inputMode="tel"
                placeholder="(900) 000-00-00"
                disabled={pending}
              />
              <AuthField
                id="auth-password"
                label={w("Пароль", "Password")}
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  clear("password");
                }}
                error={errors.password}
                autoComplete={register ? "new-password" : "current-password"}
                placeholder={w("Минимум 8 символов", "At least 8 characters")}
                maxLength={72}
                disabled={pending}
              >
                {register && (
                  <div className="meter" data-s={strength}>
                    <div className="meter-bars">
                      {[0, 1, 2, 3].map((i) => (
                        <span key={i} />
                      ))}
                    </div>
                    <span className="meter-l">
                      {
                        [
                          "",
                          w("Слабый", "Weak"),
                          w("Средний", "Fair"),
                          w("Хороший", "Good"),
                          w("Надёжный", "Strong"),
                        ][strength]
                      }
                    </span>
                  </div>
                )}
              </AuthField>
              {register && (
                <>
                  <AuthField
                    id="auth-confirmation"
                    label={w("Повторите пароль", "Confirm password")}
                    type="password"
                    value={confirmation}
                    onChange={(e) => {
                      setConfirmation(e.target.value);
                      clear("confirmation");
                    }}
                    error={errors.confirmation}
                    autoComplete="new-password"
                    maxLength={72}
                    disabled={pending}
                  />
                  <label className="chk">
                    <input
                      type="checkbox"
                      checked={agree}
                      disabled={pending}
                      onChange={(e) => setAgree(e.target.checked)}
                    />
                    <span>
                      {w(
                        "Принимаю условия обслуживания и соглашаюсь на обработку персональных данных",
                        "I accept the terms of service and consent to the processing of personal data",
                      )}
                    </span>
                  </label>
                </>
              )}
              <button
                className={"btn-dark" + (pending ? " loading" : "")}
                disabled={pending || (register && !agree)}
              >
                {register
                  ? w("Создать аккаунт", "Create account")
                  : w("Войти", "Sign in")}
              </button>
            </motion.form>
          </AnimatePresence>
        </motion.div>
      </section>
    </main>
  );
}
