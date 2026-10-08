import { api } from "./api.js";
export async function registerWorker() {
  if (!("serviceWorker" in navigator) || !window.isSecureContext) return null;
  return navigator.serviceWorker.register("/sw.js", { scope: "/" });
}
export async function enablePush(isCurrent = () => true) {
  const ensureCurrent = () => {
    if (!isCurrent()) throw new Error("Сессия изменилась. Открой настройки ещё раз");
  };
  ensureCurrent();
  if (
    !("PushManager" in window) ||
    !("Notification" in window) ||
    !window.isSecureContext
  )
    throw new Error(
      "Уведомления недоступны в этом браузере. На iPhone сначала добавь Cardo на экран «Домой»",
    );
  const registration = await registerWorker();
  if (!registration) throw new Error("Не удалось подключить уведомления");
  ensureCurrent();
  const permission = await Notification.requestPermission();
  ensureCurrent();
  if (permission !== "granted")
    throw new Error(
      "Уведомления не разрешены. Измени разрешение в настройках браузера",
    );
  const ready = await navigator.serviceWorker.ready;
  ensureCurrent();
  const { publicKey } = await api.pushConfig();
  ensureCurrent();
  const key = Uint8Array.from(
    atob(
      publicKey
        .replace(/-/g, "+")
        .replace(/_/g, "/")
        .padEnd(Math.ceil(publicKey.length / 4) * 4, "="),
    ),
    (c) => c.charCodeAt(0),
  );
  const subscription =
    (await ready.pushManager.getSubscription()) ||
    (await ready.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: key,
    }));
  ensureCurrent();
  await api.subscribe(subscription.toJSON());
}
export async function disablePush() {
  if (!("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager?.getSubscription();
  if (subscription) {
    await api.unsubscribe(subscription.endpoint);
    await subscription.unsubscribe();
  }
}
