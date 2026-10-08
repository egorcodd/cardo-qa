import { useState } from "react";
import Icon, { BrandMark } from "../icons.jsx";
import { NAV, PROFILE_MENU } from "../data.js";
import { useLang } from "../i18n.jsx";
export default function TopNav({
  view,
  setView,
  profile,
  onFaq,
  onLimits,
  onLogout,
  onLanguage,
  unread,
}) {
  const { t, lang } = useLang();
  const [menu, setMenu] = useState(false);
  function menuClick(id) {
    setMenu(false);
    if (id === "support") return onFaq();
    if (id === "limits") return onLimits();
    if (id === "exit") return onLogout();
    setView("settings");
  }
  return (
    <>
      <header className="topnav">
        <button
          className="tn-brand brand-button"
          onClick={() => setView("home")}
        >
          <BrandMark />
          <span className="tn-bt">Cardo</span>
        </button>
        <nav className="tn-tabs">
          {NAV.map((n) => (
            <button
              key={n.id}
              aria-label={t(n.key)}
              className={
                "tn-tab" +
                (view === n.id || (n.id === "send" && view === "exchange")
                  ? " active"
                  : "")
              }
              onClick={() => setView(n.id)}
            >
              <Icon name={n.icon} size={17} />
              <span className="tn-l">{t(n.key)}</span>
            </button>
          ))}
        </nav>
        <div className="tn-right">
          <button
            className="tn-icobtn notification-button"
            onClick={() => setView("notifications")}
            aria-label={lang === "ru" ? "Уведомления" : "Notifications"}
          >
            <Icon name="bell" size={18} />
            {unread > 0 && <span className="unread-dot" />}
          </button>
          <button
            className="tn-rewards"
            onClick={() => setView("rewards")}
            aria-label={t("tn.rewards")}
          >
            <Icon name="gift" size={15} />
            <span className="tn-l">{t("tn.rewards")}</span>
          </button>
          <button
            className="tn-ava-btn"
            onClick={() => setMenu((m) => !m)}
            aria-expanded={menu}
            aria-label={lang === "ru" ? "Меню профиля" : "Profile menu"}
          >
            <span className={"tn-ava tone-" + profile.avatarTone}>
              {profile.initial}
            </span>
          </button>
          {menu && (
            <>
              <div className="menu-back" onClick={() => setMenu(false)} />
              <div className="profile-menu">
                <button
                  className="pm-head profile-head"
                  onClick={() => {
                    setMenu(false);
                    setView("profile");
                  }}
                >
                  <span className={"tn-ava tone-" + profile.avatarTone}>
                    {profile.initial}
                  </span>
                  <div>
                    <div className="pm-name">{profile.name}</div>
                    <div className="pm-sub">{profile.phone}</div>
                  </div>
                </button>
                <div className="pm-lang">
                  <span>{t("menu.language")}</span>
                  <div className="pm-seg">
                    {["ru", "en"].map((l) => (
                      <button
                        key={l}
                        className={lang === l ? "on" : ""}
                        onClick={() => onLanguage(l)}
                      >
                        {l.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
                <button
                  className="pm-item"
                  onClick={() => {
                    setMenu(false);
                    setView("profile");
                  }}
                >
                  <Icon name="user" size={18} />
                  {lang === "ru" ? "Профиль" : "Profile"}
                </button>
                <button
                  className="pm-item"
                  onClick={() => {
                    setMenu(false);
                    setView("exchange");
                  }}
                >
                  <Icon name="exchange" size={18} />
                  {lang === "ru" ? "Обмен валют" : "Currency exchange"}
                </button>
                {PROFILE_MENU.map((m) => (
                  <button
                    key={m.id}
                    className={"pm-item" + (m.danger ? " danger" : "")}
                    onClick={() => menuClick(m.id)}
                  >
                    <Icon name={m.icon} size={18} />
                    {t(m.key)}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </header>
      <nav
        className="bottom-nav"
        aria-label={lang === "ru" ? "Разделы Cardo" : "Cardo sections"}
      >
        {[...NAV, { id: "profile", icon: "user" }].map((n) => (
          <button
            key={n.id}
            aria-label={
              n.id === "profile"
                ? lang === "ru"
                  ? "Профиль"
                  : "Profile"
                : t(n.key)
            }
            aria-current={view === n.id ? "page" : undefined}
            className={
              view === n.id || (n.id === "send" && view === "exchange")
                ? "active"
                : ""
            }
            onClick={() => setView(n.id)}
          >
            <Icon name={n.icon} size={19} />
          </button>
        ))}
      </nav>
    </>
  );
}
