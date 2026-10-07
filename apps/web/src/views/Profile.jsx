import { useState, useEffect } from "react";
import { api } from "../api.js";
import { useLang } from "../i18n.jsx";
import Icon from "../icons.jsx";
import Dialog from "../components/Dialog.jsx";
import Field from "../components/Field.jsx";
const phoneText = (p) =>
  p.replace(/^\+7(\d{3})(\d{3})(\d{2})(\d{2})$/, "+7 $1 $2-$3-$4");

export function Profile({ profile, onSave, go, onLimits, onLogout, notify }) {
  const { lang } = useLang(),
    w = (ru, en) => (lang === "en" ? en : ru);
  const [metrics, setMetrics] = useState(null),
    [metricError, setMetricError] = useState(false);
  const [edit, setEdit] = useState(null),
    [value, setValue] = useState(""),
    [error, setError] = useState(""),
    [pending, setPending] = useState(false);
  useEffect(() => {
    let alive = true;
    Promise.all([api.profileStats(), api.rewards()])
      .then(([stats, rewards]) => {
        if (alive) setMetrics({ ...stats, points: rewards.balance });
      })
      .catch(() => {
        if (alive) setMetricError(true);
      });
    return () => {
      alive = false;
    };
  }, []);
  const titles = {
    name: w("Имя и фамилия", "Full name"),
    email: "Email",
    birth: w("Дата рождения", "Date of birth"),
    avatarTone: w("Цвет аватара", "Avatar color"),
  };
  function open(key) {
    setEdit(key);
    setValue(profile[key] || "");
    setError("");
  }
  async function save(e) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setError("");
    try {
      await onSave({ [edit]: value.trim() });
      setEdit(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setPending(false);
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(profile.phone);
      notify(w("Номер скопирован", "Phone number copied"), "copy");
    } catch {
      notify(
        w("Не удалось скопировать номер", "Unable to copy phone number"),
        "close",
      );
    }
  }
  const birth = profile.birth
    ? new Date(profile.birth + "T00:00:00").toLocaleDateString(
        lang === "en" ? "en-GB" : "ru-RU",
        { day: "numeric", month: "long", year: "numeric" },
      )
    : w("Не указана", "Not added");
  const since = new Date(profile.createdAt).toLocaleDateString(
    lang === "en" ? "en-GB" : "ru-RU",
    { day: "numeric", month: "short" },
  );
  return (
    <div className="design-page anim">
      <section className="prof-card">
        <div className="prof-ava-wrap">
          <span className={"ava-lime prof-ava tone-" + profile.avatarTone}>
            {profile.initial}
          </span>
          <button
            className="prof-cam"
            aria-label={w("Изменить аватар", "Edit avatar")}
            onClick={() => open("avatarTone")}
          >
            <Icon name="camera" size={14} />
          </button>
        </div>
        <h1 className="prof-name">{profile.name}</h1>
        <div className="prof-phone">{phoneText(profile.phone)}</div>
        <span className="badge-lime">
          <Icon name="sparkles" size={14} />
          {profile.plan}
        </span>
        <div className="prof-stats">
          <div>
            <b>{metrics?.points ?? "…"}</b>
            <span>{w("баллов", "points")}</span>
          </div>
          <div>
            <b>{metrics?.transfers ?? "…"}</b>
            <span>{w("переводов", "transfers")}</span>
          </div>
          <div>
            <b>{since}</b>
            <span>{w("с Cardo", "joined Cardo")}</span>
          </div>
        </div>
        {metricError && (
          <p className="field-help" role="status">
            {w(
              "Статистика временно недоступна",
              "Statistics are temporarily unavailable",
            )}
          </p>
        )}
      </section>
      <h2 className="hgroup">{w("Личные данные", "Personal details")}</h2>
      <section className="req personal-details">
        {["name", "phone", "email", "birth"].map((key) => (
          <div className="req-row" key={key}>
            <div className="req-m">
              <div className="req-k">
                {key === "phone" ? w("Телефон", "Phone") : titles[key]}
              </div>
              <div className={"req-v" + (!profile[key] ? " empty" : "")}>
                {key === "birth"
                  ? birth
                  : key === "phone"
                    ? phoneText(profile.phone)
                    : profile[key] || w("Не указан", "Not added")}
              </div>
            </div>
            <button
              className="req-icbtn"
              aria-label={
                key === "phone"
                  ? w("Скопировать номер", "Copy phone number")
                  : w("Изменить ", "Edit ") + titles[key]
              }
              onClick={() => (key === "phone" ? copy() : open(key))}
            >
              <Icon name={key === "phone" ? "copy" : "pencil"} size={16} />
            </button>
          </div>
        ))}
      </section>
      <button className="promo profile-promo" onClick={() => go("rewards")}>
        <span>
          <span className="promo-t">{profile.plan}</span>
          <span className="promo-s">
            {w(
              "Копи баллы за переводы и выбирай награды.",
              "Earn points for transfers and choose your rewards.",
            )}
          </span>
        </span>
        <span className="promo-coin">
          <Icon name="sparkles" size={22} />
        </span>
      </button>
      <section className="menu-card">
        {[
          {
            id: "settings",
            icon: "settings",
            title: w("Настройки", "Settings"),
            action: () => go("settings"),
          },
          {
            id: "exchange",
            icon: "exchange",
            title: w("Обмен валют", "Currency exchange"),
            action: () => go("exchange"),
          },
          {
            id: "limits",
            icon: "card",
            title: w("Лимиты по карте", "Card limits"),
            action: onLimits,
          },
          {
            id: "exit",
            icon: "exit",
            title: w("Выйти из Cardo", "Log out of Cardo"),
            action: onLogout,
          },
        ].map((item) => (
          <button
            key={item.id}
            className={"pm-item" + (item.id === "exit" ? " danger" : "")}
            onClick={item.action}
          >
            <Icon name={item.icon} size={18} />
            {item.title}
            {item.id !== "exit" && (
              <Icon name="chevronr" className="chev" size={18} />
            )}
          </button>
        ))}
      </section>
      <Dialog
        open={!!edit}
        title={titles[edit] || ""}
        onClose={() => setEdit(null)}
        busy={pending}
      >
        <form className="sheet-form" onSubmit={save} noValidate>
          {edit === "avatarTone" ? (
            <div className="avatar-picker">
              {["lime", "dark", "violet", "blue"].map((tone) => (
                <button
                  type="button"
                  key={tone}
                  className={
                    "avatar-choice tone-" +
                    tone +
                    (value === tone ? " chosen" : "")
                  }
                  aria-label={
                    {
                      lime: "Лайм",
                      dark: "Чёрный",
                      violet: "Фиолетовый",
                      blue: "Синий",
                    }[tone]
                  }
                  aria-pressed={value === tone}
                  onClick={() => setValue(tone)}
                >
                  {profile.initial}
                  {value === tone && <Icon name="check" size={14} />}
                </button>
              ))}
            </div>
          ) : (
            <Field
              id="profile-edit"
              title={titles[edit]}
              type={
                edit === "birth" ? "date" : edit === "email" ? "email" : "text"
              }
              autoComplete={
                edit === "birth" ? "bday" : edit === "name" ? "name" : "email"
              }
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setError("");
              }}
              maxLength={edit === "name" ? 60 : 254}
              max={
                edit === "birth"
                  ? new Date().toISOString().slice(0, 10)
                  : undefined
              }
              error={error}
            />
          )}
          <button
            className={"btn-dark" + (pending ? " loading" : "")}
            disabled={pending}
          >
            {w("Сохранить", "Save")}
          </button>
        </form>
      </Dialog>
    </div>
  );
}
