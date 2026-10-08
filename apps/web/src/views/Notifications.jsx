import { useLang } from "../i18n.jsx";
export function Notifications({ items, onRead, go }) {
  const { lang } = useLang();
  const w = (ru, en) => (lang === "en" ? en : ru);
  const visibleItems = items.filter((item) => item.kind !== "test");
  const formatTime = (value) =>
    new Date(value).toLocaleString(lang === "en" ? "en-GB" : "ru-RU", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  async function openNotice(item) {
    if (await onRead(item.id)) go(item.url || "notifications");
  }
  return (
    <div className="design-page anim">
      <h1 className="send-h">{w("Уведомления", "Notifications")}</h1>
      {!visibleItems.length ? (
        <section className="card-soft">
          <p className="field-help">
            {w(
              "Пока ничего нет. Здесь появятся операции, награды и предложения Cardo.",
              "No notifications yet. Transactions, rewards and Cardo offers will appear here.",
            )}
          </p>
        </section>
      ) : (
        visibleItems.map((item) => (
          <button
            className={
              "card-soft notification-item" + (item.read ? "" : " unread")
            }
            key={item.id}
            onClick={() => openNotice(item)}
          >
            <div className="notice-top">
              <strong>
                {lang === "en"
                  ? {
                      transfer: "Transfer complete",
                      transfer_incoming: "Money received",
                      top_up: "Account topped up",
                      reward: "Reward received",
                      reminder: "Reminder",
                      offer: "Cardo offer",
                    }[item.kind] || item.title
                  : item.title}
              </strong>
              {!item.read && <span className="notice-dot" />}
            </div>
            <p>{item.body}</p>
            <time>{formatTime(item.created_at || item.createdAt)}</time>
          </button>
        ))
      )}
    </div>
  );
}
