import { useState, useCallback, useRef, useEffect } from "react";
import Auth from "./components/Auth.jsx";
import TopNav from "./components/TopNav.jsx";
import ToastStack from "./components/Toast.jsx";
import { SelectCard, CardDetails } from "./components/overlays/cards.jsx";
import {
  Receive,
  Success,
  TxDetails,
  Limits,
} from "./components/overlays/payments.jsx";
import TopUp from "./components/overlays/TopUp.jsx";
import { FaqModal } from "./components/overlays/support.jsx";
import { Home } from "./views/Home.jsx";
import { Send } from "./views/Send.jsx";
import { History } from "./views/History.jsx";
import { Cards } from "./views/Cards.jsx";
import { Profile } from "./views/Profile.jsx";
import { Settings } from "./views/Settings.jsx";
import { Rewards } from "./views/Rewards.jsx";
import { Notifications } from "./views/Notifications.jsx";
import { useLang } from "./i18n.jsx";
import { api } from "./api.js";
import { useRoute } from "./route.js";
import Exchange from "./views/Exchange.jsx";
import { registerWorker, disablePush } from "./pwa.js";
import { uncertainError } from "./operationAttempt.js";

export default function App() {
  const { t, lang, setLang } = useLang();
  const w = (ru, en) => (lang === "en" ? en : ru);
  const [route, go] = useRoute();
  const [checking, setChecking] = useState(true);
  const [profile, setProfile] = useState(null);
  const [cards, setCards] = useState(null);
  const [contacts, setContacts] = useState(null);
  const [txns, setTxns] = useState(null);
  const [notices, setNotices] = useState([]);
  const [membership, setMembership] = useState(null);
  const [loadErr, setLoadErr] = useState("");
  const [pickCard, setPickCard] = useState(false);
  const [success, setSuccess] = useState(null);
  const [faq, setFaq] = useState(false);
  const [receive, setReceive] = useState(false);
  const [topUp, setTopUp] = useState(false);
  const [limits, setLimits] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [remoteTx, setRemoteTx] = useState(null);
  const [txError, setTxError] = useState("");
  const idRef = useRef(0),
    session = useRef(0),
    snapshot = useRef(0),
    signingOut = useRef(false);
  const [online, setOnline] = useState(navigator.onLine);
  const notify = useCallback((msg, icon = "check") => {
    const id = ++idRef.current;
    setToasts((items) => [...items, { id, msg, icon, leaving: false }]);
    setTimeout(
      () =>
        setToasts((items) =>
          items.map((x) => (x.id === id ? { ...x, leaving: true } : x)),
        ),
      2500,
    );
    setTimeout(
      () => setToasts((items) => items.filter((x) => x.id !== id)),
      2850,
    );
  }, []);
  function applyProfile(p) {
    setProfile(p);
    setLang(p.language);
    try {
      localStorage.setItem(
        "cardo_last_account",
        JSON.stringify({ name: p.name, phone: p.phone }),
      );
    } catch {}
  }
  async function refresh(generation = session.current) {
    const sequence = ++snapshot.current;
    const [c, ct, transactions, notifications, plan] =
      await Promise.all([
        api.cards(),
        api.contacts(),
        api.transactions(),
        api.notifications(),
        api.membership(),
      ]);
    if (
      session.current !== generation ||
      signingOut.current ||
      sequence !== snapshot.current
    )
      return;
    setCards(c);
    setContacts(ct);
    setTxns(transactions);
    setNotices(notifications);
    setMembership(plan);
    setLoadErr("");
  }
  async function load(generation = session.current) {
    setLoadErr("");
    try {
      await refresh(generation);
    } catch (e) {
      if (session.current === generation && !signingOut.current)
        setLoadErr(e.message);
    }
  }
  useEffect(() => {
    const generation = ++session.current;
    api
      .profile()
      .then(async (p) => {
        if (generation !== session.current) return;
        applyProfile(p);
        await load(generation);
      })
      .catch((e) => {
        if (generation === session.current && e.status !== 401)
          setLoadErr(e.message);
      })
      .finally(() => {
        if (generation === session.current) setChecking(false);
      });
    return () => {
      if (session.current === generation) session.current += 1;
    };
  }, []);
  useEffect(() => {
    registerWorker().catch(() => {});
    const up = () => setOnline(navigator.onLine);
    window.addEventListener("online", up);
    window.addEventListener("offline", up);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", up);
    };
  }, []);
  useEffect(() => {
    if (!profile) return;
    let active = true,
      polling = false;
    const poll = async () => {
      if (
        !active ||
        polling ||
        !navigator.onLine ||
        document.visibilityState === "hidden" ||
        signingOut.current
      )
        return;
      polling = true;
      try {
        await refresh(session.current);
      } catch {
      } finally {
        polling = false;
      }
    };
    const message = (e) => {
      if (
        e.data?.type === "CARDO_NOTIFICATIONS_CHANGED" &&
        (!e.data.userId || e.data.userId === profile.id)
      )
        poll();
    };
    poll();
    const timer = setInterval(poll, 4500);
    window.addEventListener("focus", poll);
    window.addEventListener("online", poll);
    document.addEventListener("visibilitychange", poll);
    navigator.serviceWorker?.addEventListener("message", message);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("focus", poll);
      window.removeEventListener("online", poll);
      document.removeEventListener("visibilitychange", poll);
      navigator.serviceWorker?.removeEventListener("message", message);
    };
  }, [profile?.id]);
  useEffect(() => {
    setRemoteTx(null);
    setTxError("");
    if (!profile || route.view !== "history" || !route.id) return;
    let active = true;
    const generation = session.current;
    api
      .transaction(route.id)
      .then((value) => {
        if (active && generation === session.current)
          setRemoteTx({ userId: profile.id, id: route.id, value });
      })
      .catch((e) => {
        if (active && generation === session.current) setTxError(e.message);
      });
    return () => {
      active = false;
    };
  }, [route.view, route.id, profile?.id]);
  const details =
    route.view === "cards" && route.id && cards?.find((c) => c.id === route.id);
  const tx =
    route.view === "history" &&
    route.id &&
    (txns?.find((item) => item.id === route.id) ||
      (remoteTx?.userId === profile?.id && remoteTx?.id === route.id
        ? remoteTx.value
        : null));
  const anyModal =
    pickCard || success || faq || details || tx || receive || limits || topUp;
  useEffect(() => {
    document.body.style.overflow = anyModal ? "hidden" : "";
    const key = (e) => {
      if (e.key !== "Escape") return;
      setPickCard(false);
      setSuccess(null);
      setFaq(false);
      setReceive(false);
      setLimits(false);
      setTopUp(false);
      if (route.id) go(route.view);
    };
    window.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", key);
    };
  }, [anyModal, route.id]);
  const card = cards?.find((c) => c.id === profile?.mainCardId) || cards?.[0];
  async function saveSettings(values, rethrow = false) {
    const generation = session.current;
    try {
      const p = await api.saveSettings(values);
      if (generation !== session.current || signingOut.current) return;
      applyProfile(p);
      notify(w("Настройки сохранены", "Settings saved"));
    } catch (e) {
      if (generation === session.current) notify(e.message, "close");
      if (rethrow) throw e;
    }
  }
  async function pick(id) {
    await saveSettings({ mainCardId: id });
    setPickCard(false);
  }
  async function freeze(c) {
    const generation = session.current;
    try {
      await api.freeze(c.id, !c.frozen);
      await refresh(generation);
      if (generation === session.current)
        notify(
          c.frozen
            ? w("Карта разморожена", "Card unfrozen")
            : w("Карта заморожена", "Card frozen"),
        );
    } catch (e) {
      if (generation === session.current) notify(e.message, "close");
    }
  }
  async function send(amount, recipient, key) {
    const generation = session.current;
    const source = card;
    try {
      const receipt = await api.transfer(
        { cardId: source.id, amount, recipientId: recipient.id },
        key,
      );
      if (generation !== session.current || signingOut.current)
        return { ok: true };
      snapshot.current += 1;
      setCards((items) =>
        items?.map((c) =>
          c.id === source.id
            ? {
                ...c,
                balance: Number(receipt.balance),
                balanceMinor: Math.round(Number(receipt.balance) * 100),
              }
            : c,
        ),
      );
      setSuccess({
        amount: receipt.amount,
        recipient,
        cur: source.cur,
        bankId: receipt.bankId || recipient.bankId,
        bankName: receipt.bankName || recipient.bankName,
        recipientReference: receipt.recipientReference,
        transferKind: receipt.transferKind,
        fee: receipt.fee,
        totalDebit: receipt.totalDebit,
      });
      refresh(generation).catch(() => {});
      return { ok: true };
    } catch (e) {
      if (generation === session.current) notify(e.message, "close");
      return { ok: false, uncertain: uncertainError(e), message: e.message };
    }
  }
  async function addFunds(payload, key) {
    const generation = session.current;
    const receipt = await api.topUp(payload, key);
    if (generation !== session.current || signingOut.current) return receipt;
    snapshot.current += 1;
    setCards((items) =>
      items?.map((c) =>
        c.id === payload.cardId
          ? {
              ...c,
              balance: Number(receipt.balance),
              balanceMinor: Math.round(Number(receipt.balance) * 100),
            }
          : c,
      ),
    );
    refresh(generation).catch(() => {});
    return receipt;
  }
  async function logout() {
    if (signingOut.current) return;
    signingOut.current = true;
    const generation = ++session.current;
    try {
      await disablePush().catch(() => {});
      await api.logout();
      if (generation !== session.current) return;
      setProfile(null);
      setCards(null);
      setContacts(null);
      setTxns(null);
      setNotices([]);
      setMembership(null);
      setRemoteTx(null);
      setLoadErr("");
      setPickCard(false);
      setSuccess(null);
      setFaq(false);
      setReceive(false);
      setTopUp(false);
      setLimits(false);
      setToasts([]);
      go("home");
    } catch (e) {
      notify(e.message, "close");
    } finally {
      signingOut.current = false;
    }
  }
  async function read(id) {
    const generation = session.current;
    try {
      await api.readNotification(id);
      if (generation === session.current) {
        snapshot.current += 1;
        setNotices((items) =>
          items.map((n) => (n.id === id ? { ...n, read: true } : n)),
        );
      }
      return generation === session.current;
    } catch (e) {
      if (generation === session.current) notify(e.message, "close");
      return false;
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
            const generation = ++session.current;
            signingOut.current = false;
            setCards(null);
            setContacts(null);
            setTxns(null);
            setNotices([]);
            setMembership(null);
            setRemoteTx(null);
            applyProfile(p);
            await load(generation);
          }}
        />
        <ToastStack toasts={toasts} />
      </>
    );
  const loading = !cards || !contacts || !txns || !membership;
  const activeGeneration = session.current;
  const sessionCurrent = () =>
    activeGeneration === session.current && !signingOut.current;
  const accountNotify = (message, icon) => {
    if (sessionCurrent()) notify(message, icon);
  };
  return (
    <div className="app app-in" key={profile.id}>
      <TopNav
        view={route.view}
        setView={go}
        profile={profile}
        onFaq={() => setFaq(true)}
        onLimits={() => setLimits(true)}
        onLogout={logout}
        onLanguage={(language) => saveSettings({ language })}
        unread={notices.filter((n) => n.kind !== "test" && !n.read).length}
      />
      {!online && (
        <div className="offline-banner" role="status">
          {w(
            "Нет подключения. Для операций нужен интернет.",
            "Offline. Transactions require an internet connection.",
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
        {!loading && card && (
          <>
            {route.view === "home" && (
              <Home
                balance={card.balance}
                hideBalance={profile.hideBalance}
                cur={card.cur}
                contacts={contacts}
                txns={txns}
                go={go}
                onTx={(item) => go("/history/" + item.id)}
                onReceive={() => setReceive(true)}
                onTopUp={() => setTopUp(true)}
                membership={membership}
              />
            )}
            {route.view === "send" && (
              <Send
                balance={card.balance}
                card={card}
                contacts={contacts}
                accountId={profile.id}
                membership={membership}
                initialRecipient={route.recipient}
                onSend={send}
                onPickCard={() => setPickCard(true)}
                blocked={!!anyModal || !online}
                onRecipient={(recipient) => {
                  snapshot.current += 1;
                  setContacts((items) => [
                    recipient,
                    ...items.filter((c) => c.id !== recipient.id),
                  ]);
                }}
              />
            )}
            {route.view === "history" && (
              <History txns={txns} onTx={(item) => go("/history/" + item.id)} />
            )}
            {route.view === "cards" && (
              <Cards
                cards={cards}
                mainId={profile.mainCardId}
                onPick={pick}
                onDetails={(c) => go("/cards/" + c.id)}
                onFreeze={freeze}
              />
            )}
            {route.id &&
              !details &&
              !tx &&
              ((route.view === "history" && txError) ||
                route.view === "cards") && (
                <p className="form-error" role="alert">
                  {txError ||
                    w(
                      "Этот объект не найден в аккаунте",
                      "This item is not in your account",
                    )}
                </p>
              )}
            {route.id && route.view === "history" && !tx && !txError && (
              <p className="load-state">{t("common.loading")}</p>
            )}
            {route.view === "exchange" && (
              <Exchange
                cards={cards}
                onRefresh={() => refresh(activeGeneration)}
                notify={accountNotify}
                online={online}
                membership={membership}
                accountId={profile.id}
              />
            )}
            {route.view === "profile" && (
              <Profile
                profile={profile}
                membership={membership}
                go={go}
                onLimits={() => setLimits(true)}
                onLogout={logout}
                notify={accountNotify}
                onSave={async (values) => {
                  const generation = session.current;
                  const p = await api.saveProfile(values);
                  if (generation === session.current) {
                    applyProfile(p);
                    notify(w("Профиль сохранён", "Profile saved"));
                  }
                }}
              />
            )}
            {route.view === "settings" && (
              <Settings
                profile={profile}
                sessionCurrent={sessionCurrent}
                onSave={(values) => saveSettings(values, true)}
                onPasswordChanged={logout}
                notify={accountNotify}
              />
            )}
            {route.view === "rewards" && (
              <Rewards
                notify={accountNotify}
                onRefresh={() => refresh(activeGeneration)}
                membership={membership}
              />
            )}
            {route.view === "notifications" && (
              <Notifications
                items={notices}
                onRead={read}
                go={go}
              />
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
          notify={accountNotify}
          onClose={() => go("cards")}
        />
      )}
      {tx && <TxDetails tx={tx} onClose={() => go("history")} />}
      {receive && (
        <Receive
          card={card}
          notify={accountNotify}
          onClose={() => setReceive(false)}
        />
      )}
      {topUp && (
        <TopUp
          cards={cards}
          mainCardId={profile.mainCardId}
          accountId={profile.id}
          online={online}
          onTopUp={addFunds}
          onClose={() => setTopUp(false)}
        />
      )}
      {limits && (
        <Limits notify={accountNotify} onClose={() => setLimits(false)} />
      )}
      <ToastStack toasts={toasts} />
    </div>
  );
}
