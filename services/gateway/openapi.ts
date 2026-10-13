import { externalBanks } from "../../packages/contracts/index.ts";
import { describeOperation, schemas } from "./src/docs/contracts.ts";
const paths: Record<string, unknown> = {};
const tagNames = ["auth", "profile", "cards", "banks", "recipients", "transfer", "exchange", "transactions", "limits", "rates", "rewards", "notifications", "push", "system"];
function tagFor(path: string) {
  const group = path.split("/")[1];
  return ({ settings: "profile", "profile-stats": "profile", contacts: "recipients", "top-ups": "cards", membership: "rewards", reminders: "notifications", health: "system" } as Record<string, string>)[group] || group;
}
const routes = [
  ["get", "/health", "Доступность публичного API"],
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
  [
    "patch",
    "/profile",
    "Изменить профиль",
    {
      name: "Алексей",
      email: "alex@cardo.test",
      birth: "1998-03-14",
      avatarTone: "lime",
    },
  ],
  [
    "patch",
    "/profile/password",
    "Сменить пароль и завершить сессии",
    {
      currentPassword: "Cardo2026!",
      password: "NewCardo2026!",
      confirmPassword: "NewCardo2026!",
    },
  ],
  ["get", "/profile-stats", "Статистика аккаунта"],
  [
    "post",
    "/exchange",
    "Обмен между своими счетами",
    { from: "RUB", to: "USD", amount: "100.00" },
  ],
  ["get", "/settings", "Настройки"],
  [
    "put",
    "/settings",
    "Сохранить настройки",
    { language: "ru", hideBalance: false, mainCardId: "k1" },
  ],
  ["get", "/cards", "Список карт"],
  ["get", "/cards/{id}/requisites", "Реквизиты"],
  [
    "post",
    "/cards/{id}/freeze",
    "Заморозить или разморозить карту",
    { frozen: true },
  ],
  ["get", "/banks", "Банки получателя"],
  ["get", "/contacts", "Получатели"],
  ["get", "/recipients/examples", "Вымышленные получатели внешнего банка"],
  [
    "post",
    "/recipients/resolve",
    "Найти получателя",
    { phone: "+79990001002", bankId: "cardo" },
  ],
  ["post", "/top-ups", "Пополнить счёт", { cardId: "k1", amount: "5000.00" }],
  ["get", "/transactions", "История операций"],
  ["get", "/transactions/{id}", "Детали операции"],
  ["get", "/limits", "Лимиты"],
  ["put", "/limits", "Сохранить лимиты", { transfer: 150000, single: 300000 }],
  ["get", "/transfer/fee", "Комиссия по текущему тарифу"],
  [
    "post",
    "/transfer",
    "Перевод",
    {
      cardId: "k1",
      recipientId: "id-from-recipients-resolve",
      amount: "100.50",
    },
  ],
  ["get", "/rates", "Курсы валют"],
  ["get", "/rewards", "Награды"],
  ["get", "/membership", "Статус Cardo Плюс"],
  ["get", "/notifications/preferences", "Настройки уведомлений"],
  [
    "patch",
    "/notifications/preferences",
    "Сохранить настройки уведомлений",
    { transactions: true, service: true, offers: false },
  ],
  ["get", "/reminders", "Напоминания"],
  [
    "post",
    "/reminders",
    "Создать напоминание",
    {
      message: "Проверить перевод",
      scheduledAt: new Date(Date.now() + 86400000).toISOString(),
      idempotencyKey: "replace-with-a-new-uuid",
    },
  ],
  ["delete", "/reminders/{id}", "Отменить напоминание"],
  ["post", "/rewards/{id}/claim", "Получить награду", {}],
  ["get", "/notifications", "Уведомления"],
  ["patch", "/notifications/{id}/read", "Отметить уведомление прочитанным", {}],
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
    tags: [tagFor(path)],
    responses: {
      "200": { description: "Успешный ответ" },
      "201": { description: "Создано" },
      "401": { description: "Нужен вход" },
      "404": { description: "Получатель или объект не найден" },
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
  if (body && Object.keys(body).length)
    item.requestBody = {
      required: true,
      content: {
        "application/json": { schema: { type: "object" }, example: body },
      },
    };
  if (path === "/banks") {
    item.description =
      "Каталог банков получателя.";
    item.responses = {
      "200": {
        description: "Банки получателя",
        content: {
          "application/json": {
            schema: {
              type: "array",
              items: {
                type: "object",
                required: ["id", "name"],
                properties: {
                  id: {
                    type: "string",
                    enum: ["cardo", ...externalBanks.map((bank) => bank.id)],
                  },
                  name: { type: "string" },
                },
              },
            },
            example: [
              { id: "cardo", name: "Cardo" },
              ...externalBanks,
            ],
          },
        },
      },
      "401": { description: "Нужен вход" },
    };
  }
  if (path === "/recipients/resolve") {
    item.description =
      "Поиск по телефону или номеру карты. Для внешнего банка используется каталог вымышленных получателей.";
    const bankId = {
      type: "string",
      enum: ["cardo", ...externalBanks.map((bank) => bank.id)],
      default: "cardo",
    };
    item.requestBody = {
      required: true,
      content: {
        "application/json": {
          schema: {
            oneOf: [
              {
                type: "object",
                required: ["phone"],
                properties: { bankId, phone: { type: "string" }, currency: { type: "string", enum: ["RUB", "USD", "EUR"], default: "RUB" } },
                not: { required: ["cardNumber"] },
              },
              {
                type: "object",
                required: ["cardNumber"],
                properties: {
                  bankId,
                  cardNumber: { type: "string", pattern: "^[0-9 -]{16,24}$" },
                  currency: { type: "string", enum: ["RUB", "USD", "EUR"] },
                },
                not: { required: ["phone"] },
              },
            ],
          },
          examples: {
            cardo: {
              summary: "Клиент Cardo",
              value: { bankId: "cardo", phone: "+79990001002" },
            },
            phone: {
              summary: "Имитация по телефону",
              value: { bankId: "tbank", phone: "+79990002001" },
            },
            sber: {
              summary: "Получатель в Сбере",
              value: { bankId: "sber", phone: "+79990002011" },
            },
            alfa: {
              summary: "Получатель в Альфа-Банке",
              value: { bankId: "alfa", cardNumber: "4000000000000234" },
            },
            card: {
              summary: "Имитация по карте",
              value: { bankId: "tbank", cardNumber: "4111 1111 1111 1111" },
            },
          },
        },
      },
    };
  }
  if (path === "/recipients/examples") {
    item.description =
      "Вымышленные получатели выбранного внешнего банка. Для Cardo возвращается пустой список.";
    item.parameters = [
      {
        in: "query",
        name: "bankId",
        schema: {
          type: "string",
          enum: ["cardo", ...externalBanks.map((bank) => bank.id)],
          default: "cardo",
        },
      },
    ];
  }
  if (path === "/transfer/fee") {
    item.parameters = [{ in: "query", name: "currency", schema: { type: "string", enum: ["RUB", "USD", "EUR"], default: "RUB" } }];
    item.description = "Комиссия в валюте перевода. Стандарт: 500 RUB, 5 USD или 5 EUR; Плюс: 100 RUB, 1 USD или 1 EUR.";
  }
  if (["/exchange", "/transfer", "/top-ups"].includes(path))
    item.parameters = [
      {
        in: "header",
        name: "Idempotency-Key",
        required: true,
        schema: {
          type: "string",
          pattern:
            path === "/exchange" ? "^ex-[\\w-]{8,80}$" : "^[\\w-]{8,80}$",
        },
        description:
          path === "/exchange"
            ? "Ключ операции с префиксом ex-. Повтор с теми же данными не создаёт новую операцию."
            : "Ключ операции. Повтор с теми же данными не создаёт новую операцию.",
      },
    ];
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
  describeOperation(method, path, item);
  if (path === "/health") item.security = [];
  paths[path] = { ...((paths[path] as object) || {}), [method]: item };
}
export default {
  openapi: "3.0.3",
  info: {
    title: "Cardo API",
    version: "2.0.0",
  },
  servers: [{ url: "/api" }],
  tags: tagNames.map((name) => ({ name })),
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  components: {
    schemas,
    securitySchemes: {
      cookieAuth: { type: "apiKey", in: "cookie", name: "cardo_session" },
      bearerAuth: { type: "http", scheme: "bearer" },
    },
  },
  paths,
};
