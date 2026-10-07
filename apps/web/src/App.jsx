import { useState, useCallback, useRef, useEffect } from "react";
import Auth from "./components/Auth.jsx";
import TopNav from "./components/TopNav.jsx";
import ToastStack from "./components/Toast.jsx";
import {
  SelectCard,
  Success,
  FaqModal,
  CardDetails,
  TxDetails,
  Receive,
  Limits,
  NewCard,
} from "./components/Overlays.jsx";
import { Home, Send, History, Cards } from "./views/views.jsx";
import { Profile, Settings, Rewards, Notifications } from "./views/Account.jsx";
import { useLang } from "./i18n.jsx";
import { api } from "./api.js";
import { useRoute } from "./route.js";
import { registerWorker, disablePush } from "./pwa.js";
export default function App() {
  const { t, lang, setLang } = useLang();
  const w = (ru, en) => (lang === "en" ? en : ru);
  const [route, go] = useRoute();
  const [started, setStarted] = useState(false);
  const [checking, setChecking] = useState(true);
  const [profile, setProfile] = useState(null);
  const [cards, setCards] = useState(null);
  const [contacts, setContacts] = useState(null);
  const [txns, setTxns] = useState(null);
  const [notices, setNotices] = useState([]);
  const [loadErr, setLoadErr] = useState("");
  const [pickCard, setPickCard] = useState(false);
  const [success, setSuccess] = useState(null);
  const [faq, setFaq] = useState(false);
  const [receive, setReceive] = useState(false);
  const [limits, setLimits] = useState(false);
  const [newCard, setNewCard] = useState(false);
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);
  const [online, setOnline] = useState(navigator.onLine);
  const [installPrompt, setInstallPrompt] = useState(null);
  const notify = useCallback((msg, icon = "check") => {
    const id = ++idRef.current;
    setToasts((tt) => [...tt, { id, msg, icon, leaving: false }]);
    setTimeout(
      () =>
        setToasts((tt) =>
          tt.map((x) => (x.id === id ? { ...x, leaving: true } : x)),
        ),
      2500,
    );
    setTimeout(() => setToasts((tt) => tt.filter((x) => x.id !== id)), 2850);
  }, []);
  function applyProfile(p) {
    setProfile(p);
    setLang(p.language);
    document.documentElement.dataset.theme = p.theme;
    localStorage.setItem("cardo_theme", p.theme);
  }
  async function load(p) {
    setLoadErr("");
    try {
      const [c, ct, transactions] = await Promise.all([
        api.cards(),
        api.contacts(),
        api.transactions(),
      ]);
      setCards(c);
      setContacts(ct);
      setTxns(transactions);
      if (p) applyProfile(p);
    } catch (e) {
      setLoadErr(e.message);
    }
  }
  useEffect(() => {
    let alive = true;
    api
      .profile()
      .then((p) => {
        if (alive) {
          setStarted(true);
          applyProfile(p);
          return load();
        }
      })
      .catch((e) => {
        if (alive && e.status !== 401) {
          setStarted(true);
          setLoadErr(e.message);
        }
      })
      .finally(() => {
        if (alive) setChecking(false);
      });
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    registerWorker().catch(() => {});
    const up = () => setOnline(navigator.onLine);
    const prompt = (e) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener("online", up);
    window.addEventListener("offline", up);
    window.addEventListener("beforeinstallprompt", prompt);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", up);
      window.removeEventListener("beforeinstallprompt", prompt);
    };
  }, []);
  useEffect(() => {
    if (!profile) return;
    let active = true;
    const poll = () =>
      api
        .notifications()
        .then((items) => {
          if (active) setNotices(items);
        })
        .catch(() => {});
    poll();
    const timer = setInterval(poll, 4000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [profile?.id]);
  const details =
    route.view === "cards" && route.id && cards?.find((c) => c.id === route.id);
  const tx =
    route.view === "history" &&
    route.id &&
    txns?.find((t) => t.id === route.id);
  const anyModal =
    pickCard || success || faq || details || tx || receive || limits || newCard;
  useEffect(() => {
    document.body.style.overflow = anyModal ? "hidden" : "";
    const key = (e) => {
      if (e.key === "Escape") {
        setPickCard(false);
        setSuccess(null);
        setFaq(false);
        setReceive(false);
        setLimits(false);
        setNewCard(false);
        if (route.id) go(route.view);
      }
    };
    window.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", key);
    };
  }, [anyModal, route.id]);
  const card = cards?.find((c) => c.id === profile?.mainCardId) || cards?.[0];
  async function refresh() {
    const [c, transactions] = await Promise.all([
      api.cards(),
      api.transactions(),
    ]);
    setCards(c);
    setTxns(transactions);
  }
  async function saveSettings(values) {
    try {
      const p = await api.saveSettings(values);
      applyProfile(p);
      notify(w("Настройки сохранены", "Settings saved"));
    } catch (e) {
      notify(e.message, "close");
    }
  }
  async function pick(id) {
    await saveSettings({ mainCardId: id });
    setPickCard(false);
  }
  async function freeze(c) {
    try {
      await api.freeze(c.id, !c.frozen);
      await refresh();
      notify(
        c.frozen
          ? w("Карта разморожена", "Card unfrozen")
          : w("Карта заморожена", "Card frozen"),
      );
    } catch (e) {
      notify(e.message, "close");
    }
  }
  async function send(amount, recipient, key) {
    try {
      const receipt = await api.transfer(
        { cardId: card.id, amount, recipientId: recipient.id },
        key,
      );
      setSuccess({ amount: receipt.amount, recipient, cur: card.cur });
      refresh().catch((e) => notify(e.message, "close"));
      return { ok: true };
    } catch (e) {
      notify(e.message, "close");
      return { ok: false, uncertain: e.network || e.status >= 500 };
    }
  }
  async function logout() {
    try {
      await disablePush().catch(() => {});
      await api.logout();
      setProfile(null);
      setCards(null);
      setContacts(null);
      setTxns(null);
      setNotices([]);
      setPickCard(false);
      setSuccess(null);
      setFaq(false);
      setReceive(false);
      setLimits(false);
      setNewCard(false);
      setToasts([]);
      setStarted(true);
      go("home");
    } catch (e) {
      notify(e.message, "close");
    }
  }
  async function read(id) {
    try {
      await api.readNotification(id);
      setNotices((items) =>
        items.map((n) => (n.id === id ? { ...n, read: true } : n)),
      );
    } catch (e) {
      notify(e.message, "close");
    }
  }
  if (checking)
    return (
      <div className="load-state">
        <span className="spinner" />
        {t("common.loading")}
      </div>
    );
  if (!profile)
    return (
      <>
        <Auth
          onAuth={async (p) => {
            applyProfile(p);
            await load();
          }}
        />
        <ToastStack toasts={toasts} />
      </>
    );
  const loading = !cards || !contacts || !txns;
  return (
    <div className="app app-in">
      <TopNav
        view={route.view}
        setView={go}
        profile={profile}
        onFaq={() => setFaq(true)}
        onLimits={() => setLimits(true)}
        onLogout={logout}
        onLanguage={(language) => saveSettings({ language })}
        unread={notices.filter((n) => !n.read).length}
      />
      {!online && (
        <div className="offline-banner" role="status">
          {w(
            "Нет подключения. Для перевода нужен интернет.",
            "Offline. Transfers require an internet connection.",
          )}
        </div>
      )}
      <main className="page-wrap">
        {loadErr && (
          <section className="card-soft">
            <p className="form-error" role="alert">
              {loadErr}
            </p>
            <button className="pill" onClick={() => load()}>
              {w("Попробовать снова", "Try again")}
            </button>
          </section>
        )}
        {!loadErr && loading && (
          <div className="load-state">
            <span className="spinner" />
            {t("common.loading")}
          </div>
        )}
        {!loading && (
          <>
            {route.view === "home" && (
              <Home
                balance={card.balance}
                cur={card.cur}
                contacts={contacts}
                txns={txns}
                go={go}
                notify={notify}
                onTx={(t) => go("/history/" + t.id)}
                onReceive={() => setReceive(true)}
              />
            )}
            {route.view === "send" && (
              <Send
                balance={card.balance}
                card={card}
                contacts={contacts}
                initialRecipient={route.recipient}
                onSend={send}
                onPickCard={() => setPickCard(true)}
                blocked={!!anyModal || !online}
              />
            )}
            {route.view === "history" && (
              <History txns={txns} onTx={(t) => go("/history/" + t.id)} />
            )}
            {route.view === "cards" && (
              <Cards
                cards={cards}
                mainId={profile.mainCardId}
                onPick={pick}
                onDetails={(c) => go("/cards/" + c.id)}
                onNew={() => setNewCard(true)}
                onFreeze={freeze}
                notify={notify}
              />
            )}
            {route.id && !details && !tx && (
              <p className="form-error">
                {w(
                  "Этот объект не найден в аккаунте",
                  "This item is not in your account",
                )}
              </p>
            )}
            {route.view === "profile" && (
              <Profile
                profile={profile}
                onSave={async (values) => {
                  const p = await api.saveProfile(values);
                  applyProfile(p);
                  notify(w("Профиль сохранён", "Profile saved"));
                }}
              />
            )}
            {route.view === "settings" && (
              <Settings
                profile={profile}
                onSave={saveSettings}
                notify={notify}
                install={
                  installPrompt
                    ? async () => {
                        await installPrompt.prompt();
                        setInstallPrompt(null);
                      }
                    : null
                }
              />
            )}
            {route.view === "rewards" && <Rewards notify={notify} />}
            {route.view === "notifications" && (
              <Notifications items={notices} onRead={read} go={go} />
            )}
          </>
        )}
      </main>
      {pickCard && (
        <SelectCard
          cards={cards}
          cardId={profile.mainCardId}
          onPick={pick}
          onClose={() => setPickCard(false)}
          onNew={() => {
            setPickCard(false);
            setNewCard(true);
          }}
        />
      )}
      {success && (
        <Success
          data={success}
          onClose={() => {
            setSuccess(null);
            go("home");
          }}
        />
      )}
      {faq && <FaqModal onClose={() => setFaq(false)} />}
      {details && (
        <CardDetails
          card={details}
          notify={notify}
          onClose={() => go("cards")}
        />
      )}
      {tx && <TxDetails tx={tx} onClose={() => go("history")} />}
      {receive && (
        <Receive
          card={card}
          notify={notify}
          onClose={() => setReceive(false)}
        />
      )}
      {limits && <Limits notify={notify} onClose={() => setLimits(false)} />}
      {newCard && (
        <NewCard
          notify={notify}
          onClose={() => setNewCard(false)}
          onCreate={async (values) => {
            await api.newCard(values);
            await refresh();
            setNewCard(false);
            notify(w("Карта выпущена", "Card issued"), "card");
          }}
        />
      )}
      <ToastStack toasts={toasts} />
    </div>
  );
}
