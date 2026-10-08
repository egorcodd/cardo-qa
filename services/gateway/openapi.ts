import { externalBanks } from "../../packages/contracts/index.ts";
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
  ["get", "/cards", "Мои карты"],
  ["get", "/cards/{id}/requisites", "Реквизиты"],
  [
    "post",
    "/cards/{id}/freeze",
    "Заморозить или разморозить карту",
    { frozen: true },
  ],
  ["get", "/banks", "Банки получателя"],
  ["put", "/banks/{bankId}/favorite", "Добавить банк в избранное"],
  ["delete", "/banks/{bankId}/favorite", "Убрать банк из избранного"],
  ["get", "/contacts", "Получатели"],
  ["get", "/recipients/examples", "Вымышленные получатели внешнего банка"],
  [
    "post",
    "/recipients/resolve",
    "Найти получателя",
    { phone: "+79990001002", bankId: "cardo" },
  ],
  ["post", "/top-ups", "Пополнить счёт", { cardId: "k1", amount: "5000.00" }],
  ["get", "/transactions", "История"],
  ["get", "/transactions/{id}", "Моя операция"],
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
  ["get", "/rates", "Курсы Cardo из сервиса Rates"],
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
      scheduledAt: "2026-12-01T10:00:00Z",
      idempotencyKey: "replace-with-a-new-uuid",
    },
  ],
  ["delete", "/reminders/{id}", "Отменить напоминание"],
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
  if (body)
    item.requestBody = {
      required: true,
      content: {
        "application/json": { schema: { type: "object" }, example: body },
      },
    };
  if (path === "/banks") {
    item.description =
      "Каталог банков с избранным текущего аккаунта. При первом создании аккаунта Cardo добавлен в избранное. Его можно удалить, изменения сохраняются. Порядок каталога постоянный, favorite отражает личный выбор. Настоящие межбанковские платежи не выполняются.";
    item.responses = {
      "200": {
        description: "Банки получателя",
        content: {
          "application/json": {
            schema: {
              type: "array",
              items: {
                type: "object",
                required: ["id", "name", "favorite"],
                properties: {
                  id: {
                    type: "string",
                    enum: ["cardo", ...externalBanks.map((bank) => bank.id)],
                  },
                  name: { type: "string" },
                  favorite: {
                    type: "boolean",
                    description: "Банк в избранном текущего аккаунта",
                  },
                },
              },
            },
            example: [
              { id: "cardo", name: "Cardo", favorite: true },
              ...externalBanks,
            ],
          },
        },
      },
      "401": { description: "Нужен вход" },
    };
  }
  if (path === "/banks/{bankId}/favorite") {
    item.description =
      "Сохраняет избранное только для текущего аккаунта. Повтор запроса безопасен. Ответ содержит полный каталог с актуальным избранным. Тело запроса не требуется.";
    item.parameters = [
      {
        in: "path",
        name: "bankId",
        required: true,
        schema: {
          type: "string",
          enum: ["cardo", ...externalBanks.map((bank) => bank.id)],
        },
      },
    ];
    item.responses = {
      "200": {
        description: "Обновлённый каталог банков",
        content: {
          "application/json": {
            schema: {
              type: "array",
              items: {
                type: "object",
                required: ["id", "name", "favorite"],
                properties: {
                  id: {
                    type: "string",
                    enum: ["cardo", ...externalBanks.map((bank) => bank.id)],
                  },
                  name: { type: "string" },
                  favorite: { type: "boolean" },
                },
              },
            },
          },
        },
      },
      "401": { description: "Нужен вход" },
      "422": { description: "Неизвестный банк" },
    };
  }
  if (path === "/recipients/resolve") {
    item.description =
      "Для Cardo ищет зарегистрированного клиента. Для другого банка проверяет номер по каталогу вымышленных получателей. Неизвестный номер возвращает 404 и не создаёт контакт. Имя возвращается с первой буквой фамилии. bankId по умолчанию cardo; реальные банковские API не вызываются.";
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
                properties: { bankId, phone: { type: "string" } },
                not: { required: ["cardNumber"] },
              },
              {
                type: "object",
                required: ["cardNumber"],
                properties: {
                  bankId,
                  cardNumber: { type: "string", pattern: "^[0-9 -]{16,24}$" },
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
      "Номера вымышленных получателей для проверки имитации внешнего перевода. Для Cardo список пуст: ищи свой зарегистрированный аккаунт. По умолчанию bankId=cardo.";
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
  if (path === "/transfer")
    item.description =
      "В Cardo атомарно списывает и зачисляет двум клиентам. Для внешнего банка имитирует перевод: списание, история и уведомление только отправителю. Банк определяется сохранённым recipientId; чужие счета Cardo не зачисляются.";
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
            ? "Новый ключ с префиксом ex-. При повторе того же обмена используй прежний ключ."
            : "Новый ключ операции. Для повторного запроса с теми же данными используй прежний ключ.",
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
  paths[path] = { ...((paths[path] as object) || {}), [method]: item };
}
export default {
  openapi: "3.0.3",
  info: {
    title: "Cardo API",
    version: "2.0.0",
    description:
      "Банковский стенд для QA. Новый аккаунт начинает с нуля. Пополни счёт и выбери банк получателя. Переводы клиентам Cardo зачисляются на их счета, другие банки используются для имитации переводов с записью в историю. В Postman используй Bearer token из ответа регистрации/входа. SMS нет. Данные сохраняются в PostgreSQL.",
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
