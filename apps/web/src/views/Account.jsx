import { useState, useEffect } from "react";
import { api } from "../api.js";
import { useLang } from "../i18n.jsx";
import { enablePush, disablePush } from "../pwa.js";
import Icon from "../icons.jsx";
export function Profile({ profile, onSave }) {
  const { lang } = useLang();
  const w = (ru, en) => (lang === "en" ? en : ru);
  const [name, setName] = useState(profile.name);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function save(e) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setError("");
    try {
      await onSave({ name });
    } catch (e) {
      setError(e.message);
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="account-page anim">
      <h1 className="send-h">{w("Профиль", "Profile")}</h1>
      <section className="card-soft">
        <div className="profile-summary">
          <span className="tn-ava">{profile.initial}</span>
          <div>
            <strong>{profile.name}</strong>
            <p className="field-help">{profile.plan}</p>
          </div>
        </div>
        <form className="field-list" onSubmit={save}>
          <label className="field">
            {w("Имя", "Name")}
            <input
              value={name}
              maxLength={60}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>
          <label className="field">
            {w("Номер телефона", "Phone number")}
            <input value={profile.phone} readOnly />
          </label>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <button className="btn-dark" disabled={pending}>
            {w("Сохранить", "Save")}
          </button>
        </form>
      </section>
    </div>
  );
}
export function Settings({ profile, onSave, notify, install }) {
  const { lang } = useLang();
  const w = (ru, en) => (lang === "en" ? en : ru);
  const [push, setPush] = useState(false);
  const [pending, setPending] = useState(false);
  useEffect(() => {
    navigator.serviceWorker
      ?.getRegistration()
      .then((r) => r?.pushManager?.getSubscription())
      .then((s) => setPush(!!s))
      .catch(() => {});
  }, []);
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
  return (
    <div className="account-page anim">
      <h1 className="send-h">{w("Настройки", "Settings")}</h1>
      <section className="card-soft setting-list">
        <label className="field">
          {w("Оформление", "Appearance")}
          <select
            value={profile.theme}
            onChange={(e) => onSave({ theme: e.target.value })}
          >
            <option value="light">{w("Светлое", "Light")}</option>
            <option value="dark">{w("Тёмное", "Dark")}</option>
            <option value="system">{w("Как на устройстве", "System")}</option>
          </select>
        </label>
        <label className="field">
          {w("Язык", "Language")}
          <select
            value={profile.language}
            onChange={(e) => onSave({ language: e.target.value })}
          >
            <option value="ru">Русский</option>
            <option value="en">English</option>
          </select>
        </label>
      </section>
      <section className="card-soft">
        <h2 className="soft-title">{w("Уведомления", "Notifications")}</h2>
        <p className="field-help">
          {w(
            "Переводы и награды доступны в разделе уведомлений. Включи push, чтобы получать их и вне Cardo.",
            "Transfers and rewards appear in Notifications. Enable push to receive them outside Cardo.",
          )}
        </p>
        <div className="button-stack">
          <button className="pill" onClick={toggle} disabled={pending}>
            {push
              ? w("Отключить push", "Disable push")
              : w("Включить push", "Enable push")}
          </button>
          <button className="sheet-close" onClick={test} disabled={pending}>
            {w("Проверить уведомление", "Test notification")}
          </button>
        </div>
      </section>
      <section className="card-soft">
        <h2 className="soft-title">
          {w("Cardo на устройстве", "Cardo on your device")}
        </h2>
        {install ? (
          <button className="pill" onClick={install}>
            {w("Установить Cardo", "Install Cardo")}
          </button>
        ) : (
          <p className="field-help">
            {w(
              "Открой меню браузера и выбери установку приложения. На iPhone: «Поделиться» → «На экран Домой».",
              "Use the browser menu to install Cardo. On iPhone: Share → Add to Home Screen.",
            )}
          </p>
        )}
      </section>
    </div>
  );
}
export function Rewards({ notify }) {
  const { lang } = useLang();
  const w = (ru, en) => (lang === "en" ? en : ru);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState("");
  async function load() {
    try {
      setData(await api.rewards());
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => {
    load();
  }, []);
  async function claim(id) {
    if (pending) return;
    setPending(id);
    try {
      await api.claimReward(id);
      await load();
      notify(w("Награда получена", "Reward received"), "gift");
    } catch (e) {
      notify(e.message, "close");
    } finally {
      setPending("");
    }
  }
  return (
    <div className="account-page anim">
      <h1 className="send-h">{w("Награды", "Rewards")}</h1>
      {error ? (
        <div className="card-soft">
          <p role="alert">{error}</p>
          <button className="pill" onClick={load}>
            {w("Попробовать снова", "Try again")}
          </button>
        </div>
      ) : !data ? (
        <p className="load-state">{w("Загрузка…", "Loading…")}</p>
      ) : (
        <>
          <section className="bal-card">
            <div className="bal-label">{w("Твои баллы", "Your points")}</div>
            <div className="bal-big">{data.balance}</div>
            <p className="field-help">
              {w(
                "За каждый выполненный перевод добавляем 5 баллов.",
                "Every completed transfer earns 5 points.",
              )}
            </p>
          </section>
          {data.items.map((item) => (
            <section className="card-soft reward-card" key={item.id}>
              <Icon name="gift" size={26} />
              <h2 className="soft-title">
                {lang === "en" ? item.titleEn : item.title}
              </h2>
              <div className="reward-cost">
                {item.cost} {w("баллов", "points")}
              </div>
              <button
                className="pill"
                disabled={!!pending || item.claimed}
                onClick={() => claim(item.id)}
              >
                {item.claimed
                  ? w("Получена", "Claimed")
                  : w("Получить", "Claim")}
              </button>
            </section>
          ))}
        </>
      )}
    </div>
  );
}
export function Notifications({ items, onRead, go }) {
  const { lang } = useLang();
  const w = (ru, en) => (lang === "en" ? en : ru);
  async function open(item) {
    await onRead(item.id);
    go(item.url);
  }
  return (
    <div className="account-page anim">
      <h1 className="send-h">{w("Уведомления", "Notifications")}</h1>
      {!items.length ? (
        <section className="card-soft">
          <p className="field-help">
            {w(
              "Пока ничего нет. Здесь появятся переводы и награды.",
              "No notifications yet. Transfers and rewards will appear here.",
            )}
          </p>
        </section>
      ) : (
        items.map((item) => (
          <button
            className={
              "card-soft notification-item" + (item.read ? "" : " unread")
            }
            key={item.id}
            onClick={() => open(item)}
          >
            <div className="notice-top">
              <strong>
                {lang === "en"
                  ? {
                      transfer: "Transfer complete",
                      reward: "Reward received",
                      test: "Cardo notification",
                    }[item.kind] || item.title
                  : item.title}
              </strong>
              {!item.read && <span className="notice-dot" />}
            </div>
            <p>{item.body}</p>
            <time>
              {new Date(item.created_at).toLocaleString(
                lang === "en" ? "en-GB" : "ru-RU",
              )}
            </time>
          </button>
        ))
      )}
    </div>
  );
}
