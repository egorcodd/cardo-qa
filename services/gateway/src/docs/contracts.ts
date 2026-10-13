type Schema = Record<string, unknown>;
type Operation = Record<string, any>;
const ref = (name: string) => ({ $ref: "#/components/schemas/" + name });
const object = (properties: Record<string, Schema>, required: string[] = []) => ({
  type: "object", properties, ...(required.length ? { required } : {}),
});
const text = { type: "string" };
const flag = { type: "boolean" };
const instant = { type: "string", format: "date-time" };
const password = { type: "string", minLength: 8, maxLength: 72, description: "Минимум одна буква и цифра, без пробелов." };
const birth = { type: "string", pattern: "^$|^\\d{4}-\\d{2}-\\d{2}$", description: "YYYY-MM-DD или пустая строка для очистки. Допустимый возраст: от 14 до 110 лет." };

export const schemas: Record<string, Schema> = {
  Membership: object({ premium: flag, plan: { type: "string", enum: ["standard", "plus"] }, expiresAt: { ...instant, nullable: true } }, ["premium", "plan", "expiresAt"]),
  ExternalRecipient: object({ bankId: text, name: text, phone: text, cardNumber: { type: "string", pattern: "^\\d{16}$" } }, ["bankId", "name", "phone", "cardNumber"]),
  Transaction: object({
    id: text, name: text, cat: text, amount: { type: "number" },
    amountMinor: { type: "string", pattern: "^-?\\d+$" },
    code: ref("Currency"), cur: { type: "string", enum: ["₽", "$", "€"], description: "Знак валюты code." },
    icon: text, group: text, card: text, status: text, createdAt: instant,
    fee: ref("DecimalAmount"), feeMinor: ref("MinorUnits"),
    totalDebit: ref("DecimalAmount"), totalDebitMinor: ref("MinorUnits"),
    plan: { type: "string", nullable: true, enum: ["standard", "plus", null] },
    transferId: text, counterpartyUserId: { type: "string", nullable: true },
    bankId: text, bankName: text, recipientReference: { type: "string", nullable: true },
    transferKind: { type: "string", enum: ["internal", "external"] },
  }, ["id", "name", "cat", "amount", "amountMinor", "code", "cur", "icon", "group", "card", "status", "createdAt"]),
  Limit: object({
    id: { type: "string", enum: ["transfer", "withdraw", "online", "single"] },
    key: text, sub: text, min: { type: "integer" }, max: { type: "integer" },
    step: { type: "integer" }, def: { type: "integer" }, value: { type: "integer" },
  }, ["id", "key", "sub", "min", "max", "step", "def", "value"]),
  Rates: object({
    base: { type: "string", enum: ["RUB"] },
    rates: object({ USD: { type: "number" }, EUR: { type: "number" } }, ["USD", "EUR"]),
    asOf: { type: "string", format: "date" }, version: text, source: text,
    sourceUrl: { type: "string", format: "uri" }, fetchedAt: instant, stale: flag,
  }, ["base", "rates", "asOf", "version", "source", "sourceUrl", "fetchedAt", "stale"]),
  Reward: object({ id: text, title: text, titleEn: text, cost: { type: "integer" }, description: text, claimed: flag }, ["id", "title", "titleEn", "cost", "description", "claimed"]),
  Rewards: object({ balance: { type: "integer", minimum: 0 }, items: { type: "array", items: ref("Reward") } }, ["balance", "items"]),
  Currency: { type: "string", enum: ["RUB", "USD", "EUR"] },
  AmountInput: {
    description: "Сумма в основных единицах валюты, до двух знаков после точки. Строка сохраняет точность.",
    oneOf: [
      { type: "string", pattern: "^(?=.*[1-9])\\d{1,10}(\\.\\d{1,2})?$", example: "100.50" },
      { type: "number", minimum: 0, exclusiveMinimum: true, maximum: 9999999999.99, multipleOf: 0.01 },
    ],
  },
  DecimalAmount: { type: "string", pattern: "^\\d+\\.\\d{2}$", example: "100.50" },
  MinorUnits: { type: "string", pattern: "^\\d+$", description: "Целое число копеек или центов в строке." },
  Ok: object({ ok: { type: "boolean", enum: [true] } }, ["ok"]),
  Error: object({ error: object({ code: text, message: text, requestId: text, details: {} }, ["code", "message"]) }, ["error"]),
  Profile: object({
    id: { type: "string", format: "uuid" }, name: text, initial: text,
    phone: { type: "string", pattern: "^\\+79\\d{9}$" }, email: text, birth,
    plan: { type: "string", enum: ["Cardo"] }, isDemo: flag,
    language: { type: "string", enum: ["ru", "en"] },
    theme: { type: "string", enum: ["light", "dark", "system"] },
    mainCardId: text, avatarTone: text, hideBalance: flag,
    createdAt: instant, passwordChangedAt: instant,
  }, ["id", "name", "phone", "language", "theme", "mainCardId", "hideBalance"]),
  AuthResponse: object({ user: ref("Profile"), token: {
    type: "string", pattern: "^[a-f0-9]{64}$",
    description: "Токен сессии для Authorization: Bearer <token>.",
  } }, ["user", "token"]),
  Card: object({
    id: text, num: { type: "string", pattern: "^\\d{4}$" }, holder: text,
    balance: { type: "number", minimum: 0 }, balanceMinor: ref("MinorUnits"),
    code: ref("Currency"), cur: { type: "string", enum: ["₽", "$", "€"] },
    tone: text, frozen: flag,
  }, ["id", "num", "holder", "balance", "balanceMinor", "code", "cur", "frozen"]),
  CardRequisites: object({
    number: { type: "string", pattern: "^\\d{16}$" },
    exp: { type: "string", pattern: "^(0[1-9]|1[0-2])/\\d{2}$" },
    cvc: { type: "string", pattern: "^\\d{3}$" }, holder: text, account: text,
  }, ["number", "exp", "cvc", "holder", "account"]),
  Recipient: object({
    id: text, name: text, acct: text, initial: text, tone: text, img: text,
    currency: ref("Currency"), kind: { type: "string", enum: ["registered", "external"] },
    bankId: text, bankName: text, lookupType: { type: "string", enum: ["phone", "card"] },
    targetUserId: { type: "string", nullable: true }, reference: text, lookupValue: text,
  }, ["id", "name", "currency", "kind", "bankId", "bankName"]),
  TransferFee: object({
    fee: ref("DecimalAmount"), feeMinor: ref("MinorUnits"), currency: ref("Currency"),
    plan: { type: "string", enum: ["standard", "plus"] },
  }, ["fee", "feeMinor", "currency", "plan"]),
  TransferResult: object({
    ok: { type: "boolean", enum: [true] }, status: { type: "string", enum: ["completed"] },
    transferId: text, senderOperationId: text, receiverOperationId: text, feeOperationId: text,
    amount: ref("DecimalAmount"), fee: ref("DecimalAmount"), feeMinor: ref("MinorUnits"),
    totalDebit: ref("DecimalAmount"), totalDebitMinor: ref("MinorUnits"), balance: ref("DecimalAmount"),
    currency: ref("Currency"), plan: { type: "string", enum: ["standard", "plus"] },
    bankId: text, bankName: text, recipientReference: text,
    transferKind: { type: "string", enum: ["internal", "external"] },
  }, ["ok", "status", "transferId", "senderOperationId", "feeOperationId", "amount", "fee", "feeMinor", "totalDebit", "totalDebitMinor", "balance", "currency", "plan", "bankId", "transferKind"]),
  TopUpResult: object({
    ok: { type: "boolean", enum: [true] }, status: { type: "string", enum: ["completed"] },
    operationId: text, amount: ref("DecimalAmount"), balance: ref("DecimalAmount"), currency: ref("Currency"),
  }, ["ok", "status", "operationId", "amount", "balance", "currency"]),
  ExchangeResult: object({
    ok: { type: "boolean", enum: [true] }, id: text, from: ref("Currency"), to: ref("Currency"),
    amount: ref("DecimalAmount"), received: ref("DecimalAmount"), rate: { type: "number" },
    rateVersion: text, createdAt: instant,
  }, ["ok", "id", "from", "to", "amount", "received", "rate", "rateVersion", "createdAt"]),
  NotificationPreferences: object({ transactions: flag, service: flag, offers: flag }, ["transactions", "service", "offers"]),
  Notification: object({
    id: { type: "string", format: "uuid" }, kind: text, title: text, body: text, url: text,
    read: flag, read_at: { ...instant, nullable: true }, created_at: instant,
  }, ["id", "kind", "title", "body", "url", "read", "created_at"]),
  Reminder: object({
    id: { type: "string", format: "uuid" }, message: text, scheduledAt: instant, createdAt: instant,
    status: { type: "string", enum: ["scheduled", "delivered", "cancelled"] },
    deliveredAt: { ...instant, nullable: true }, cancelledAt: { ...instant, nullable: true },
  }, ["id", "message", "scheduledAt", "status", "createdAt", "deliveredAt", "cancelledAt"]),
};

const requestSchemas: Record<string, Schema> = {
  "put /limits": {
    type: "object", minProperties: 1, additionalProperties: false,
    properties: {
      transfer: { type: "integer", minimum: 0, maximum: 1000000 },
      withdraw: { type: "integer", minimum: 0, maximum: 500000 },
      online: { type: "integer", minimum: 0, maximum: 1000000 },
      single: { type: "integer", minimum: 1000, maximum: 1000000 },
    },
  },
  "post /auth/register": object({ phone: text, password, confirmPassword: password, name: { type: "string", minLength: 2, maxLength: 60 } }, ["phone", "password"]),
  "post /auth/login": object({ phone: text, password }, ["phone", "password"]),
  "patch /profile": object({ name: { type: "string", minLength: 2, maxLength: 60 }, email: text, birth, avatarTone: { type: "string", enum: ["lime", "dark", "violet", "blue"] } }),
  "patch /profile/password": object({ currentPassword: password, password, confirmPassword: password }, ["currentPassword", "password", "confirmPassword"]),
  "put /settings": object({ language: { type: "string", enum: ["ru", "en"] }, theme: { type: "string", enum: ["light", "dark", "system"] }, mainCardId: text, hideBalance: flag }),
  "post /cards/{id}/freeze": object({ frozen: flag }),
  "post /top-ups": object({ cardId: text, amount: ref("AmountInput") }, ["cardId", "amount"]),
  "post /transfer": object({ cardId: text, recipientId: text, amount: ref("AmountInput") }, ["cardId", "recipientId", "amount"]),
  "post /exchange": object({ from: ref("Currency"), to: ref("Currency"), amount: ref("AmountInput") }, ["from", "to", "amount"]),
  "patch /notifications/preferences": { type: "object", minProperties: 1, additionalProperties: false, properties: { transactions: flag, service: flag, offers: flag } },
  "post /reminders": object({ message: { type: "string", minLength: 1, maxLength: 280 }, scheduledAt: { ...instant, description: "Будущее время в пределах одного года." }, idempotencyKey: { type: "string", pattern: "^[A-Za-z0-9_-]{1,80}$" } }, ["message", "scheduledAt"]),
  "post /push/subscriptions": object({ subscription: object({
    endpoint: { type: "string", format: "uri", maxLength: 2048, description: "HTTPS endpoint PushManager: Apple, FCM, Mozilla или Windows Push." },
    keys: object({ p256dh: { type: "string", description: "base64url, 65 байт, несжатый P-256." }, auth: { type: "string", description: "base64url, 16 байт." } }, ["p256dh", "auth"]),
  }, ["endpoint", "keys"]) }, ["subscription"]),
  "delete /push/subscriptions": object({ endpoint: { type: "string", format: "uri" } }, ["endpoint"]),
};
const resultSchemas: Record<string, Schema> = {
  "get /health": object({ status: { type: "string", enum: ["ok"] }, version: text }, ["status", "version"]),
  "post /auth/logout": ref("Ok"),
  "patch /profile/password": object({ ok: { type: "boolean", enum: [true] }, reauthenticate: { type: "boolean", enum: [true] } }, ["ok", "reauthenticate"]),
  "get /profile-stats": object({ transfers: { type: "integer", minimum: 0 } }, ["transfers"]),
  "get /recipients/examples": { type: "array", items: ref("ExternalRecipient") },
  "get /transactions": { type: "array", items: ref("Transaction") }, "get /transactions/{id}": ref("Transaction"),
  "get /limits": { type: "array", items: ref("Limit") }, "put /limits": ref("Ok"),
  "get /rates": ref("Rates"), "get /rewards": ref("Rewards"),
  "post /rewards/{id}/claim": object({ ok: { type: "boolean", enum: [true] }, balance: { type: "integer", minimum: 0 }, membership: ref("Membership") }, ["ok", "balance", "membership"]),
  "patch /notifications/{id}/read": ref("Ok"),
  "post /notifications/test": object({ ok: { type: "boolean", enum: [true] }, id: { type: "string", format: "uuid" }, pushQueued: { type: "integer", minimum: 0 } }, ["ok", "id", "pushQueued"]),
  "delete /reminders/{id}": ref("Ok"),
  "post /push/subscriptions": ref("Ok"), "delete /push/subscriptions": ref("Ok"),

  "post /auth/register": ref("AuthResponse"), "post /auth/login": ref("AuthResponse"),
  "get /profile": ref("Profile"), "patch /profile": ref("Profile"),
  "get /settings": ref("Profile"), "put /settings": ref("Profile"),
  "get /cards": { type: "array", items: ref("Card") },
  "get /cards/{id}/requisites": ref("CardRequisites"),
  "post /cards/{id}/freeze": object({ id: text, frozen: flag }, ["id", "frozen"]),
  "get /contacts": { type: "array", items: ref("Recipient") },
  "post /recipients/resolve": ref("Recipient"), "get /transfer/fee": ref("TransferFee"),
  "post /transfer": ref("TransferResult"), "post /top-ups": ref("TopUpResult"),
  "post /exchange": ref("ExchangeResult"),
  "get /notifications": { type: "array", items: ref("Notification") },
  "get /notifications/preferences": ref("NotificationPreferences"),
  "patch /notifications/preferences": ref("NotificationPreferences"),
  "get /reminders": { type: "array", items: ref("Reminder") }, "post /reminders": ref("Reminder"),
  "get /push/config": object({ publicKey: text }, ["publicKey"]),
  "get /membership": ref("Membership"),
};

export function describeOperation(method: string, path: string, operation: Operation) {
  const key = method + " " + path;
  operation.operationId = method + path.replaceAll(/[^A-Za-z0-9]+/g, "_");
  const success = ["post /auth/register", "post /push/subscriptions", "post /notifications/test"].includes(key) ? "201" : "200";
  if (success === "201") delete operation.responses["200"];
  else if (key !== "post /reminders") delete operation.responses["201"];
  const responseSchema = resultSchemas[key];
  if (responseSchema) {
    operation.responses[success].content = { "application/json": { schema: responseSchema } };
    if (key === "post /reminders") operation.responses["201"].content = { "application/json": { schema: responseSchema } };
  }
  if (requestSchemas[key] && operation.requestBody) {
    operation.requestBody.content["application/json"].schema = requestSchemas[key];
  }
  if (key === "post /reminders") {
    operation.responses["201"].description = "Напоминание создано";
    operation.responses["200"].description = "Результат повторного запроса";
    operation.description = "До 100 активных напоминаний на аккаунт.";
  }
  if (method === "get") {
    delete operation.responses["409"];
    if (!["/profile", "/cards/{id}/requisites", "/transactions/{id}"].includes(path)) delete operation.responses["404"];
    if (!["/recipients/examples", "/transfer/fee", "/transactions"].includes(path)) delete operation.responses["422"];
  }
  if (path === "/health") {
    for (const status of Object.keys(operation.responses)) if (Number(status) >= 400) delete operation.responses[status];
  } else if (method !== "get") operation.responses["400"] = { description: "Некорректный JSON" };
  for (const [status, description] of Object.entries({
    "403": "Запрос с другого origin отклонён", "429": "Превышена частота запросов авторизации",
    "500": "Внутренняя ошибка", "503": "Зависимый сервис временно недоступен",
  })) {
    if (path !== "/health" && (status !== "429" || path.startsWith("/auth/"))) operation.responses[status] = { description };
  }
  for (const [status, response] of Object.entries(operation.responses) as [string, Operation][]) {
    if (Number(status) >= 400) response.content = { "application/json": { schema: ref("Error") } };
    response.headers = { "X-Request-Id": { description: "Идентификатор запроса в логах сервисов.", schema: text } };
  }
  if (path === "/recipients/resolve") {
    operation.description += " По телефону валюта задаётся currency, по карте определяется картой. Внешние банки поддерживают только RUB.";
    const examples = operation.requestBody.content["application/json"].examples;
    examples.cardoUsd = { summary: "Счёт Cardo в USD по телефону", value: { bankId: "cardo", phone: "+79990001002", currency: "USD" } };
    examples.cardoEur = { summary: "Счёт Cardo в EUR по телефону", value: { bankId: "cardo", phone: "+79990001002", currency: "EUR" } };
  }
  if (path === "/transfer") {
    operation.description = "Перевод между счетами одной валюты с отдельной комиссией. Валюта определяется cardId; конвертации нет. Внешние переводы имитируются только в RUB.";
  }
  if (path === "/exchange") operation.description = "Обмен между своими счетами в двух разных валютах. Курс и его версия берутся из Rates.";
  if (path === "/top-ups") operation.description = "Пополнение в валюте выбранной карты. Реальные платежи не выполняются.";
  if (path === "/transfer/fee") {
    operation.responses["200"].content["application/json"].examples = Object.fromEntries(
      ["standard", "plus"].flatMap((plan) => ["RUB", "USD", "EUR"].map((currency) => {
        const fee = currency === "RUB" ? (plan === "plus" ? 100 : 500) : (plan === "plus" ? 1 : 5);
        return [plan + currency, { summary: plan + " / " + currency, value: { fee: fee.toFixed(2), feeMinor: String(fee * 100), currency, plan } }];
      })),
    );
  }
  if (key === "post /push/subscriptions") operation.description = "Регистрация подписки PushManager текущего устройства.";
}
