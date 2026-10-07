import { useState, useEffect } from "react";
import { api } from "../api.js";
import { useLang } from "../i18n.jsx";
import { enablePush, disablePush } from "../pwa.js";
import Icon from "../icons.jsx";
import Dialog from "../components/Dialog.jsx";
import Field from "../components/Field.jsx";
function SettingRow({ icon, title, subtitle, children, onClick }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      className={"set-row" + (!onClick ? " static" : "")}
      onClick={onClick}
      type={onClick ? "button" : undefined}
    >
      <span className="set-ico">
        <Icon name={icon} size={18} />
      </span>
      <span>
        <span className="set-t">{title}</span>
        <span className="set-s">{subtitle}</span>
      </span>
      {children || <Icon name="chevronr" size={18} />}
    </Tag>
  );
}
export function Settings({
  profile,
  onSave,
  notify,
  install,
  onPasswordChanged,
}) {
  const { lang } = useLang(),
    w = (ru, en) => (lang === "en" ? en : ru);
  const [push, setPush] = useState(false),
    [pending, setPending] = useState(false),
    [pushReady, setPushReady] = useState(false);
  const [draft, setDraft] = useState({
      language: profile.language,
      hideBalance: profile.hideBalance,
    }),
    [error, setError] = useState("");
  const [passwordOpen, setPasswordOpen] = useState(false),
    [passwords, setPasswords] = useState({
      currentPassword: "",
      password: "",
      confirmPassword: "",
    }),
    [pwError, setPwError] = useState("");
  const dirty =
    draft.language !== profile.language ||
    draft.hideBalance !== profile.hideBalance;
  useEffect(() => {
    let alive = true;
    navigator.serviceWorker
      ?.getRegistration()
      .then((r) => r?.pushManager?.getSubscription())
      .then((s) => {
        if (alive) {
          setPush(!!s);
          setPushReady(true);
        }
      })
      .catch(() => {
        if (alive) setPushReady(true);
      });
    return () => {
      alive = false;
    };
  }, []);
  useEffect(
    () =>
      setDraft({
        language: profile.language,
        hideBalance: profile.hideBalance,
      }),
    [profile.language, profile.hideBalance],
  );
  async function toggle() {
    if (pending) return;
    setPending(true);
    try {
      if (push) await disablePush();
      else await enablePush();
      setPush(!push);
      notify(
        push
          ? w("Уведомления отключены", "Notifications disabled")
          : w("Уведомления включены", "Notifications enabled"),
      );
    } catch (e) {
      notify(e.message, "close");
    } finally {
      setPending(false);
    }
  }
  async function test() {
    if (pending) return;
    setPending(true);
    try {
      const result = await api.testNotification();
      notify(
        result.pushQueued
          ? w("Уведомление отправлено в очередь", "Notification queued")
          : w("Уведомление добавлено в Cardo", "Notification added to Cardo"),
      );
    } catch (e) {
      notify(e.message, "close");
    } finally {
      setPending(false);
    }
  }
  async function save() {
    setPending(true);
    setError("");
    try {
      await onSave(draft);
    } catch (e) {
      setError(e.message);
    } finally {
      setPending(false);
    }
  }
  async function change(e) {
    e.preventDefault();
    if (pending) return;
    if (passwords.password !== passwords.confirmPassword) {
      setPwError(w("Пароли не совпадают", "Passwords do not match"));
      return;
    }
    setPending(true);
    setPwError("");
    try {
      await api.changePassword(passwords);
      setPasswordOpen(false);
      setPasswords({ currentPassword: "", password: "", confirmPassword: "" });
      await onPasswordChanged();
    } catch (e) {
      setPwError(e.message);
    } finally {
      setPending(false);
    }
  }
  function reset() {
    setDraft({ language: "ru", hideBalance: false });
    setError("");
  }
  return (
    <div className="design-page anim">
      <div className="page-h">
        <h1 className="send-h">{w("Настройки", "Settings")}</h1>
        <button
          className="soft-link settings-reset"
          onClick={reset}
          disabled={pending}
        >
          <Icon name="reset" size={17} />
          {w("По умолчанию", "Reset defaults")}
        </button>
      </div>
      <section className="set-group">
        <h2 className="set-gt">{w("Безопасность", "Security")}</h2>
        <div className="set-card">
          <SettingRow
            icon="key"
            title={w("Пароль", "Password")}
            subtitle={
              w("Изменён ", "Changed ") +
              new Date(profile.passwordChangedAt).toLocaleDateString(
                lang === "en" ? "en-GB" : "ru-RU",
              )
            }
            onClick={() => {
              setPwError("");
              setPasswords({
                currentPassword: "",
                password: "",
                confirmPassword: "",
              });
              setPasswordOpen(true);
            }}
          />
        </div>
      </section>
      <section className="set-group">
        <h2 className="set-gt">{w("Уведомления", "Notifications")}</h2>
        <div className="set-card">
          <SettingRow
            icon="bell"
            title="Push"
            subtitle={w("Операции и награды", "Transactions and rewards")}
          >
            <input
              className="sw"
              type="checkbox"
              role="switch"
              aria-label={w("Push-уведомления", "Push notifications")}
              checked={push}
              onChange={toggle}
              disabled={pending || !pushReady}
            />
          </SettingRow>
          <SettingRow
            icon="shield"
            title={w("Проверить уведомление", "Test notification")}
            subtitle={w(
              "Отправить сообщение в Cardo",
              "Send a message to Cardo",
            )}
            onClick={pending ? undefined : test}
          />
        </div>
      </section>
      <section className="set-group">
        <h2 className="set-gt">{w("Интерфейс", "Interface")}</h2>
        <div className="set-card">
          <SettingRow
            icon="languages"
            title={w("Язык", "Language")}
            subtitle={w("Меню и операции", "Menus and transactions")}
          >
            <div className="seg">
              {["ru", "en"].map((l) => (
                <button
                  key={l}
                  className={draft.language === l ? "on" : ""}
                  aria-pressed={draft.language === l}
                  disabled={pending}
                  onClick={() => setDraft({ ...draft, language: l })}
                >
                  {l.toUpperCase()}
                </button>
              ))}
            </div>
          </SettingRow>
          <SettingRow
            icon="eyeoff"
            title={w("Скрывать баланс", "Hide balance")}
            subtitle={w(
              "Сумма откроется по нажатию",
              "Tap to reveal the amount",
            )}
          >
            <input
              className="sw"
              type="checkbox"
              role="switch"
              aria-label={w("Скрывать баланс", "Hide balance")}
              checked={draft.hideBalance}
              onChange={(e) =>
                setDraft({ ...draft, hideBalance: e.target.checked })
              }
              disabled={pending}
            />
          </SettingRow>
        </div>
      </section>
      <section className="set-group">
        <h2 className="set-gt">
          {w("Cardo на устройстве", "Cardo on your device")}
        </h2>
        <div className="set-card">
          <SettingRow
            icon="smartphone"
            title={w("Приложение Cardo", "Cardo app")}
            subtitle={
              install
                ? w("Добавить на главный экран", "Add to your home screen")
                : w(
                    "В меню браузера: «Установить». На iPhone: «Поделиться» → «На экран Домой».",
                    "Use Install in the browser menu. On iPhone: Share → Add to Home Screen.",
                  )
            }
            onClick={install}
          />
        </div>
      </section>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button
        className={"btn-dark" + (pending ? " loading" : "")}
        disabled={!dirty || pending}
        onClick={save}
      >
        {dirty
          ? w("Сохранить изменения", "Save changes")
          : w("Сохранено", "Saved")}
      </button>
      <Dialog
        open={passwordOpen}
        title={w("Смена пароля", "Change password")}
        onClose={() => setPasswordOpen(false)}
        busy={pending}
      >
        <p className="sheet-p">
          {w(
            "После смены пароля нужно будет войти снова на всех устройствах.",
            "You will need to sign in again on every device after changing your password.",
          )}
        </p>
        <form className="sheet-form" onSubmit={change}>
          {["currentPassword", "password", "confirmPassword"].map((key, i) => (
            <Field
              key={key}
              id={"change-" + key}
              title={
                [
                  w("Текущий пароль", "Current password"),
                  w("Новый пароль", "New password"),
                  w("Повторите новый пароль", "Confirm new password"),
                ][i]
              }
              type="password"
              autoComplete={i === 0 ? "current-password" : "new-password"}
              value={passwords[key]}
              onChange={(e) => {
                setPasswords({ ...passwords, [key]: e.target.value });
                setPwError("");
              }}
              minLength={8}
              maxLength={72}
              required
            />
          ))}
          {pwError && (
            <p className="form-error" role="alert">
              {pwError}
            </p>
          )}
          <button
            className={"btn-dark" + (pending ? " loading" : "")}
            disabled={pending}
          >
            {w("Сменить пароль", "Change password")}
          </button>
        </form>
      </Dialog>
    </div>
  );
}
