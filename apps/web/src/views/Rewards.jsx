import { useState, useEffect, useRef } from "react";
import { api } from "../api.js";
import { useLang } from "../i18n.jsx";
import Icon from "../icons.jsx";
import { Coins, Crown } from "lucide-react";
import Dialog from "../components/Dialog.jsx";
function RewardSymbol({ id, size = 24 }) {
  if (id === "plus")
    return <Crown size={size} strokeWidth={1.8} aria-hidden="true" />;
  if (id === "cashback")
    return <Coins size={size} strokeWidth={1.8} aria-hidden="true" />;
  return <Icon name={id === "travel" ? "plane" : "gift"} size={size} />;
}
export function Rewards({ notify, onRefresh, membership }) {
  const { lang } = useLang(),
    w = (ru, en) => (lang === "en" ? en : ru);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [pending, setPending] = useState(false),
    [selected, setSelected] = useState(null),
    [claimed, setClaimed] = useState(false);
  async function load() {
    try {
      const value = await api.rewards();
      if (alive.current) {
        setData(value);
        setError("");
      }
    } catch (e) {
      if (alive.current) setError(e.message);
    }
  }
  useEffect(() => {
    load();
  }, []);
  async function claim() {
    if (pending) return;
    setPending(true);
    try {
      const result = await api.claimReward(selected.id);
      if (!alive.current) return;
      onRefresh?.().catch(() => {});
      setData((d) => ({
        ...d,
        balance: result.balance,
        items: d.items,
      }));
      setClaimed(true);
      notify(w("Награда получена", "Reward received"), "gift");
    } catch (e) {
      if (alive.current) notify(e.message, "close");
    } finally {
      if (alive.current) setPending(false);
    }
  }
  const title = selected
    ? lang === "en"
      ? selected.titleEn
      : selected.title
    : "";
  return (
    <div className="design-page anim">
      <h1 className="send-h">{w("Награды", "Rewards")}</h1>
      {error ? (
        <section className="card-soft">
          <p role="alert">{error}</p>
          <button className="pill" onClick={load}>
            {w("Попробовать снова", "Try again")}
          </button>
        </section>
      ) : !data ? (
        <p className="load-state">{w("Загрузка…", "Loading…")}</p>
      ) : (
        <>
          <section className="rewards-wallet">
            <span className="reward-wallet-symbol" aria-hidden="true">
              <Coins size={42} strokeWidth={1.6} />
            </span>
            <span className="badge-lime">
              {membership?.premium && (
                <Crown size={14} strokeWidth={1.8} aria-hidden="true" />
              )}
              {membership?.premium
                ? w("Cardo Плюс", "Cardo Plus")
                : w("Награды Cardo", "Cardo Rewards")}
            </span>
            <div className="reward-points">{data.balance} ₽</div>
            <div className="bal-label">{w("Твои баллы", "Your points")}</div>
            <p className="field-help">
              {w(
                "За каждый выполненный перевод добавляем 5 баллов.",
                "Every completed transfer earns 5 points.",
              )}
            </p>
          </section>
          <section className="set-card">
            {data.items.map((item) => (
              <button
                className="set-row reward-row"
                key={item.id}
                onClick={() => {
                  setSelected(item);
                  setClaimed(item.claimed);
                }}
              >
                <span className={"set-ico reward-icon reward-icon-" + item.id}>
                  <RewardSymbol id={item.id} size={24} />
                </span>
                <span>
                  <span className="set-t">
                    {lang === "en" ? item.titleEn : item.title}
                  </span>
                  <span className="set-s">
                    {item.cost} {w("баллов", "points")}
                  </span>
                </span>
                {item.claimed ? (
                  <span className="chip-pos">
                    <Icon name="check" size={13} />
                    {w("Получена", "Claimed")}
                  </span>
                ) : (
                  <Icon name="chevronr" size={18} />
                )}
              </button>
            ))}
          </section>
        </>
      )}
      <Dialog
        open={!!selected}
        title={w("Твоя награда", "Your reward")}
        onClose={() => setSelected(null)}
        className={"reward-dialog" + (claimed ? " done" : "")}
        busy={pending}
      >
        <div className="rw-medal">
          <div className="rw-burst" aria-hidden="true">
            {Array.from({ length: 8 }, (_, i) => (
              <span key={i} style={{ "--i": i }} />
            ))}
          </div>
          <div className="rw-circle">
            {claimed ? (
              <Icon name="check" size={46} />
            ) : (
              <RewardSymbol id={selected?.id} size={42} />
            )}
          </div>
        </div>
        <span className="badge-lime">
          {claimed
            ? w("Награда получена", "Reward received")
            : w("Награды Cardo", "Cardo Rewards")}
        </span>
        <h2 className="rw-title">{title}</h2>
        <div className="suc-amount">
          {selected?.cost} {w("баллов", "points")}
        </div>
        <p className="suc-to">
          {claimed
            ? w(
                "Награда сохранена в твоём аккаунте.",
                "Your reward is saved to your account.",
              )
            : w(
                "Обменивай баллы на бонусы Cardo.",
                "Exchange your points for Cardo rewards.",
              )}
        </p>
        {!claimed && (
          <div className="rw-prog">
            <div className="rw-prog-top">
              <span>{w("Накоплено", "Collected")}</span>
              <span>
                {data?.balance} / {selected?.cost}
              </span>
            </div>
            <div className="rw-bar">
              <span
                style={{
                  width:
                    Math.min(
                      100,
                      ((data?.balance || 0) / (selected?.cost || 1)) * 100,
                    ) + "%",
                }}
              />
            </div>
            <div className="rw-prog-s">
              {data?.balance >= selected?.cost
                ? w(
                    "Баллов достаточно, можно забрать награду.",
                    "You have enough points to claim this reward.",
                  )
                : w("Ещё ", "You need ") +
                  ((selected?.cost || 0) - (data?.balance || 0)) +
                  w(" баллов до награды.", " more points.")}
            </div>
          </div>
        )}
        <button
          className={"btn-dark" + (pending ? " loading" : "")}
          onClick={claimed ? () => setSelected(null) : claim}
          disabled={
            pending ||
            (!claimed && (data?.balance || 0) < (selected?.cost || 0))
          }
        >
          {claimed ? w("Готово", "Done") : w("Забрать награду", "Claim reward")}
        </button>
        {!claimed && (
          <button
            className="rw-later"
            onClick={() => setSelected(null)}
            disabled={pending}
          >
            {w("Позже", "Later")}
          </button>
        )}
      </Dialog>
    </div>
  );
}
