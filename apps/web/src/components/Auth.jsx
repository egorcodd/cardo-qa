import { useState } from "react";
import { api } from "../api.js";
import { useLang } from "../i18n.jsx";
export default function Auth({ onAuth }) {
  const { lang } = useLang();
  const word = (ru, en) => (lang === "en" ? en : ru);
  const [mode, setMode] = useState("login");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function submit(e) {
    e.preventDefault();
    if (pending) return;
    setError("");
    setPending(true);
    try {
      const result =
        mode === "register"
          ? await api.register({ phone, password, confirmPassword: confirm })
          : await api.login({ phone, password });
      await onAuth(result.user);
    } catch (e) {
      setError(e.message);
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="auth-wrap">
      <div className="auth-brand">
        <img src="/logo.png" alt="" />
        Cardo
      </div>
      <section className="card-soft auth-card">
        <h1 className="send-h">
          {mode === "login"
            ? word("С возвращением", "Welcome back")
            : word("Создать аккаунт", "Create an account")}
        </h1>
        <div className="pm-seg auth-tabs">
          {["login", "register"].map((m) => (
            <button
              key={m}
              className={mode === m ? "on" : ""}
              onClick={() => {
                setMode(m);
                setError("");
              }}
            >
              {m === "login"
                ? word("Вход", "Sign in")
                : word("Регистрация", "Register")}
            </button>
          ))}
        </div>
        <form onSubmit={submit} className="field-list">
          <label className="field">
            {word("Номер телефона", "Phone number")}
            <input
              name="phone"
              type="tel"
              autoComplete="tel"
              placeholder="+7 999 123-45-67"
              maxLength={24}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
            />
          </label>
          <label className="field">
            {word("Пароль", "Password")}
            <div className="password-input">
              <input
                name="password"
                type={show ? "text" : "password"}
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                value={password}
                maxLength={72}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button type="button" onClick={() => setShow(!show)}>
                {show ? word("Скрыть", "Hide") : word("Показать", "Show")}
              </button>
            </div>
          </label>
          {mode === "register" && (
            <>
              <div className="field-help">
                {word(
                  "От 8 до 72 символов, хотя бы одна буква и цифра. Без пробелов.",
                  "8 to 72 characters, at least one letter and one digit. No spaces.",
                )}
              </div>
              <label className="field">
                {word("Повтори пароль", "Repeat password")}
                <input
                  name="confirmPassword"
                  type={show ? "text" : "password"}
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                />
              </label>
            </>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="btn-dark" disabled={pending}>
            {pending
              ? word("Подожди…", "Please wait…")
              : mode === "login"
                ? word("Войти", "Sign in")
                : word("Зарегистрироваться", "Register")}
          </button>
        </form>
      </section>
    </div>
  );
}
