import { useState, useEffect, useRef } from "react";
import { api } from "../api.js";
import { useLang } from "../i18n.jsx";
import { enablePush, disablePush } from "../pwa.js";
import Icon from "../icons.jsx";
import Dialog from "../components/Dialog.jsx";
import Field from "../components/Field.jsx";
import ValidationMessage from "../components/ValidationMessage.jsx";
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
  onPasswordChanged,
  sessionCurrent,
}) {
  const { lang } = useLang(),
    w = (ru, en) => (lang === "en" ? en : ru);
  const alive = useRef(true);
  const savedInterface = useRef({
    language: profile.language,
    hideBalance: profile.hideBalance,
  });
  const [preferences, setPreferences] = useState(null),
    [savedPreferences, setSavedPreferences] = useState(null),
    [preferenceError, setPreferenceError] = useState("");
  async function loadPreferences() {
    try {
      const value = await api.notificationPreferences();
      if (alive.current) {
        setPreferences(value);
        setSavedPreferences(value);
        setPreferenceError("");
      }
    } catch (e) {
      if (alive.current) setPreferenceError(e.message);
    }
  }
  useEffect(() => {
    alive.current = true;
    loadPreferences();
    return () => {
      alive.current = false;
    };
  }, []);
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
  const interfaceDirty =
    draft.language !== profile.language ||
    draft.hideBalance !== profile.hideBalance;
  const preferencesDirty =
    preferences &&
    savedPreferences &&
    ["transactions", "service", "offers"].some(
      (key) => preferences[key] !== savedPreferences[key],
    );
  const dirty = interfaceDirty || preferencesDirty;
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
  useEffect(() => {
    const previous = savedInterface.current;
    const next = {
      language: profile.language,
      hideBalance: profile.hideBalance,
    };
    savedInterface.current = next;
    setDraft((current) => ({
      language:
        current.language === previous.language
          ? next.language
          : current.language,
      hideBalance:
        current.hideBalance === previous.hideBalance
          ? next.hideBalance
          : current.hideBalance,
    }));
  }, [profile.language, profile.hideBalance]);
  async function toggle() {
    if (pending) return;
    setPending(true);
    try {
      if (push) await disablePush();
      else await enablePush(() => alive.current && sessionCurrent());
      if (!alive.current) return;
      setPush(!push);
      notify(
        push
          ? w("Уведомления отключены", "Notifications disabled")
          : w("Уведомления включены", "Notifications enabled"),
      );
    } catch (e) {
      if (alive.current) notify(e.message, "close");
    } finally {
      if (alive.current) setPending(false);
    }
  }
  async function save() {
    if (pending || !dirty) return;
    setPending(true);
    setError("");
    try {
      if (preferencesDirty) {
        const value = await api.saveNotificationPreferences(preferences);
        if (!alive.current) return;
        setPreferences(value);
        setSavedPreferences(value);
      }
      if (interfaceDirty) await onSave(draft);
      else if (alive.current)
        notify(w("Настройки сохранены", "Settings saved"));
    } catch (e) {
      if (alive.current) setError(e.message);
    } finally {
      if (alive.current) setPending(false);
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
      if (!alive.current) return;
      setPasswordOpen(false);
      setPasswords({ currentPassword: "", password: "", confirmPassword: "" });
      await onPasswordChanged();
    } catch (e) {
      if (alive.current) setPwError(e.message);
    } finally {
      if (alive.current) setPending(false);
    }
  }
  return (
    <div className="design-page anim">
      <div className="page-h">
        <h1 className="send-h">{w("Настройки", "Settings")}</h1>
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
            title={w("На этом устройстве", "On this device")}
            subtitle={w("Сообщения на экране", "Messages on your screen")}
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
          {preferences &&
            [
              {
                key: "transactions",
                icon: "card",
                title: w("Операции", "Transactions"),
                subtitle: w("Переводы и пополнения", "Transfers and top-ups"),
              },
              {
                key: "service",
                icon: "clock",
                title: w("Сервис", "Service"),
                subtitle: w(
                  "Безопасность и награды",
                  "Security and rewards",
                ),
              },
              {
                key: "offers",
                icon: "gift",
                title: w("Предложения", "Offers"),
                subtitle: w(
                  "Новости и возможности Cardo",
                  "Cardo news and features",
                ),
              },
            ].map((item) => (
              <SettingRow
                key={item.key}
                icon={item.icon}
                title={item.title}
                subtitle={item.subtitle}
              >
                <input
                  className="sw"
                  type="checkbox"
                  role="switch"
                  aria-label={item.title}
                  checked={preferences[item.key]}
                  disabled={pending}
                  onChange={(e) =>
                    setPreferences({
                      ...preferences,
                      [item.key]: e.target.checked,
                    })
                  }
                />
              </SettingRow>
            ))}
        </div>
      </section>
      {preferenceError && (
        <section className="card-soft">
          <ValidationMessage message={preferenceError} />
          <button className="soft-link" onClick={loadPreferences}>
            {w("Повторить", "Retry")}
          </button>
        </section>
      )}
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
      <ValidationMessage message={error} />
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
          <ValidationMessage message={pwError} />
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
