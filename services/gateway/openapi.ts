const paths: Record<string, unknown> = {};
const routes = [
  [
    "post",
    "/auth/register",
    "Регистрация",
    {
      phone: "+79991234567",
      password: "Cardo2026!",
      confirmPassword: "Cardo2026!",
      name: "Алексей",
    },
  ],
  [
    "post",
    "/auth/login",
    "Вход",
    { phone: "+79991234567", password: "Cardo2026!" },
  ],
  ["post", "/auth/logout", "Выход", {}],
  ["get", "/profile", "Профиль"],
  ["patch", "/profile", "Изменить имя", { name: "Алексей" }],
  ["get", "/settings", "Настройки"],
  [
    "put",
    "/settings",
    "Сохранить настройки",
    { language: "ru", theme: "dark", mainCardId: "k1" },
  ],
  ["get", "/cards", "Мои карты"],
  ["post", "/cards", "Выпустить карту", { currency: "RUB", tone: "lime" }],
  ["get", "/cards/{id}/requisites", "Реквизиты"],
  [
    "post",
    "/cards/{id}/freeze",
    "Заморозить или разморозить карту",
    { frozen: true },
  ],
  ["get", "/contacts", "Получатели"],
  ["get", "/transactions", "История"],
  ["get", "/limits", "Лимиты"],
  ["put", "/limits", "Сохранить лимиты", { transfer: 150000, single: 300000 }],
  [
    "post",
    "/transfer",
    "Перевод",
    {
      cardId: "k1",
      recipientId: "c1",
      amount: "100.50",
      idempotencyKey: "replace-with-a-new-uuid",
    },
  ],
  ["get", "/rates", "Курсы для примера"],
  ["get", "/rewards", "Награды"],
  ["post", "/rewards/{id}/claim", "Получить награду", {}],
  ["get", "/notifications", "Уведомления"],
  ["patch", "/notifications/{id}/read", "Прочитать", {}],
  ["post", "/notifications/test", "Проверить уведомления", {}],
  ["get", "/push/config", "Открытый VAPID ключ"],
  [
    "post",
    "/push/subscriptions",
    "Подписаться на push",
    {
      subscription: {
        endpoint: "https://.../",
        keys: { p256dh: "...", auth: "..." },
      },
    },
  ],
  [
    "delete",
    "/push/subscriptions",
    "Отключить push",
    { endpoint: "https://.../" },
  ],
] as const;
for (const [method, path, summary, body] of routes) {
  const item: Record<string, unknown> = {
    summary,
    tags: [path.split("/")[1]],
    responses: {
      "200": { description: "Успешный ответ" },
      "201": { description: "Создано" },
      "401": { description: "Нужен вход" },
      "409": { description: "Конфликт" },
      "422": { description: "Некорректные данные" },
    },
    ...(path.startsWith("/auth/") ? { security: [] } : {}),
    ...(path.includes("{id}")
      ? {
          parameters: [
            {
              in: "path",
              name: "id",
              required: true,
              schema: { type: "string" },
            },
          ],
        }
      : {}),
  };
  if (body)
    item.requestBody = {
      required: true,
      content: {
        "application/json": { schema: { type: "object" }, example: body },
      },
    };
  if (path === "/transactions")
    item.parameters = [
      {
        in: "query",
        name: "limit",
        schema: { type: "integer", minimum: 1, maximum: 100 },
      },
      {
        in: "query",
        name: "currency",
        schema: { type: "string", enum: ["RUB", "USD", "EUR"] },
      },
    ];
  paths[path] = { ...((paths[path] as object) || {}), [method]: item };
}
export default {
  openapi: "3.0.3",
  info: {
    title: "Cardo API",
    version: "2.0.0",
    description:
      "Учебный банк. Зарегистрируй аккаунт, затем используй cookie в браузере или Bearer token из ответа регистрации/входа в Postman. SMS нет. Данные сохраняются в PostgreSQL.",
  },
  servers: [{ url: "/api" }],
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  components: {
    securitySchemes: {
      cookieAuth: { type: "apiKey", in: "cookie", name: "cardo_session" },
      bearerAuth: { type: "http", scheme: "bearer" },
    },
  },
  paths,
};
