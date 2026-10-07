async function req(path, opts = {}) {
  let res;
  try {
    res = await fetch("/api" + path, {
      ...opts,
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    });
  } catch {
    const err = new Error(
      "Нет связи с Cardo. Проверь подключение и попробуй снова",
    );
    err.network = true;
    throw err;
  }
  let body;
  try {
    body = await res.json();
  } catch {
    const error = new Error(
      "Ответ Cardo не получен полностью. Проверь историю операции",
    );
    error.network = true;
    throw error;
  }
  if (!res.ok) {
    const err = new Error(body.error?.message || "Не удалось выполнить запрос");
    err.status = res.status;
    err.code = body.error?.code;
    throw err;
  }
  return body;
}
const body = (method, value) => ({ method, body: JSON.stringify(value) });
export const api = {
  register: (value) => req("/auth/register", body("POST", value)),
  login: (value) => req("/auth/login", body("POST", value)),
  logout: () => req("/auth/logout", body("POST", {})),
  profile: () => req("/profile"),
  saveProfile: (value) => req("/profile", body("PATCH", value)),
  contacts: () => req("/contacts"),
  cards: () => req("/cards"),
  requisites: (id) => req("/cards/" + encodeURIComponent(id) + "/requisites"),
  transactions: () => req("/transactions"),
  newCard: (value) => req("/cards", body("POST", value)),
  freeze: (id, frozen) =>
    req(
      "/cards/" + encodeURIComponent(id) + "/freeze",
      body("POST", { frozen }),
    ),
  transfer: (value, key) =>
    req("/transfer", {
      ...body("POST", value),
      headers: { "Idempotency-Key": key },
    }),
  limits: () => req("/limits"),
  saveLimits: (value) => req("/limits", body("PUT", value)),
  rewards: () => req("/rewards"),
  claimReward: (id) =>
    req("/rewards/" + encodeURIComponent(id) + "/claim", body("POST", {})),
  rates: () => req("/rates"),
  settings: () => req("/settings"),
  saveSettings: (value) => req("/settings", body("PUT", value)),
  notifications: () => req("/notifications"),
  readNotification: (id) =>
    req(
      "/notifications/" + encodeURIComponent(id) + "/read",
      body("PATCH", {}),
    ),
  pushConfig: () => req("/push/config"),
  subscribe: (subscription) =>
    req("/push/subscriptions", body("POST", { subscription })),
  unsubscribe: (endpoint) =>
    req("/push/subscriptions", body("DELETE", { endpoint })),
  testNotification: () => req("/notifications/test", body("POST", {})),
};
