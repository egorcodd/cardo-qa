const VERSION = "cardo-development";
const ASSETS = [];
self.addEventListener("install", (event) =>
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()),
  ),
);
self.addEventListener("activate", (event) =>
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key.startsWith("cardo-") && key !== VERSION).map((key) => caches.delete(key))),
    ).then(() => self.clients.claim()),
  ),
);
self.addEventListener("fetch", (event) => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api") || url.pathname === "/health" || url.pathname === "/metrics")
    return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/index.html")));
    return;
  }
  if (!ASSETS.includes(url.pathname)) return;
  event.respondWith(caches.open(VERSION).then((cache) =>
    cache.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })),
  ));
});
function notificationUrl(value) {
  const raw = String(value || "/notifications");
  return /^\/(?:history(?:\/[\w-]+)?|cards(?:\/[\w-]+)?|rewards|notifications|exchange|send|settings|profile)?$/.test(raw) ? raw : "/notifications";
}
async function refreshWindows(data) {
  const clients = self.clients ? await self.clients.matchAll({ type: "window", includeUncontrolled: true }) : [];
  for (const client of clients)
    if (new URL(client.url).origin === self.location.origin)
      client.postMessage({
        type: "CARDO_NOTIFICATIONS_CHANGED",
        notificationId: data.notificationId || data.tag || null,
        userId: data.userId || null,
        url: notificationUrl(data.url),
      });
}
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data?.json() || {}; } catch {}
  const url = notificationUrl(data.url);
  event.waitUntil(Promise.all([
    self.registration.showNotification(String(data.title || "Cardo"), {
      body: String(data.body || ""),
      icon: "/icon-192.png",
      badge: "/logo.png",
      tag: String(data.tag || data.notificationId || "cardo"),
      data: { url, notificationId: data.notificationId || data.tag || null, userId: data.userId || null },
    }),
    refreshWindows({ ...data, url }),
  ]));
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const url = new URL(notificationUrl(data.url), self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clients) => {
    const client = clients.find((client) => new URL(client.url).origin === self.location.origin);
    if (client) {
      await client.navigate(url);
      await client.focus();
      await refreshWindows(data);
    } else await self.clients.openWindow(url);
  }));
});
