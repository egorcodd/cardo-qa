import { useLang } from "../i18n.jsx";
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
