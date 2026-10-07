# Cardo

Учебный банковский стенд для практики QA.

## Локальный запуск

Нужен Docker с поддержкой Compose.

```sh
docker compose up -d --build
```

- Приложение: http://localhost:8942
- API и Swagger: http://localhost:8942/api/docs
- PostgreSQL: localhost:5434, база `cardo`, пользователь `cardo_qa`, пароль `cardo_qa_dev`.

Зарегистрируйся по номеру телефона и паролю. Подтверждение по SMS не требуется.

`docker compose down` останавливает стенд и сохраняет данные в томе `cardo-data`. Удаление этого тома удалит данные.

## Проверка и разработка

Node.js 24 или новее.

```sh
npm ci
npm run typecheck
npm test
npm run build
```

При запущенном PostgreSQL доступны `npm run dev` и `npm run test:integration`. Для отдельных адресов базы используются переменные `DATABASE_URL` и `TEST_DATABASE_URL`.

Настройки портов находятся в `.env.example`.
