# Выпуск расширенного окружения Cardo

Этот порядок предназначен оператору сервера. Ученики запускают свою копию по [обычной инструкции](OBSERVABILITY.md). Применение файлов само по себе не заменяет разрешения владельца на выпуск.

## Подготовить окружение

Используй сервер Cardo с минимум 8 ГБ памяти и достаточным диском для образов и журналов. Один брокер и один Elasticsearch подходят для учебного стенда; репликации между серверами здесь нет. На сервере сохрани копию текущего кода, образов, конфигураций и проверенный дамп PostgreSQL в закрытом каталоге. Не переносить его в Git или на компьютер ученика.

Сохрани прежние .env и docker-compose.override.yml, проект Compose и volume PostgreSQL. В закрытом override должны остаться настоящие DATABASE_URL четырёх приложений, INTERNAL_TOKEN, безопасные cookie и прежние ограничения ресурсов. Новый пакет не меняет SQL-схему и не требует восстановления базы.

Создай отдельные пароли инструментов:

```sh
node scripts/prepare-observability-env.mjs
```

Файл .local/observability.env создаётся с правами 600 и не перезаписывается повторным запуском. Не публикуй его и не выводи развёрнутый compose config с секретами в общие логи. По умолчанию origin — https://cardo.egorcod.com; для своего размещения укажи существующий HTTPS-адрес. Серверный overlay требует все пароли и ключи. Локальные значения с суффиксом _dev на общий сервер не подходят.

## Собрать и запустить

В командах явно передаются оба окружения и четыре Compose-файла. Закрытый override сохраняет подключения приложений; последующий overlay включает Kafka и ограничивает память инструментов.

```sh
docker compose --env-file .env --env-file .local/observability.env \
  -f docker-compose.yml -f docker-compose.override.yml \
  -f docker-compose.observability.yml -f docker-compose.observability.proxy.yml \
  config --quiet

docker compose --env-file .env --env-file .local/observability.env \
  -f docker-compose.yml -f docker-compose.override.yml \
  -f docker-compose.observability.yml -f docker-compose.observability.proxy.yml \
  build

docker compose --env-file .env --env-file .local/observability.env \
  -f docker-compose.yml -f docker-compose.override.yml \
  -f docker-compose.observability.yml -f docker-compose.observability.proxy.yml \
  up -d
```

Запускать build до переключения приложения. Не использовать down -v, prune volumes или новую переменную имени проекта. Одноразовые setup-контейнеры должны завершиться с кодом 0. Тринадцать постоянных контейнеров должны работать; двенадцать имеют healthcheck, Kafka UI дополнительно проверяется запросом и входом в браузере.

Grafana перечитывает файлы дашбордов каждые 30 секунд. Такой режим работает и с Docker bind mounts, где уведомление о правке файла может не доходить до приложения; основание — [правила provisioning Grafana](https://grafana.com/docs/grafana/latest/administration/provisioning/#detect-updates-to-provisioned-dashboards-files).

Серверные ограничения новых контейнеров: Kafka 1024 МБ, Kafka UI 512 МБ, Elasticsearch 1536 МБ, Kibana 1024 МБ, сборщик 256 МБ, Grafana 384 МБ и Prometheus 256 МБ. Сумма 4992 МБ; ОС, прежние приложения и PostgreSQL требуют отдельного запаса. Следи за resident memory, OOM, перезапусками и свободным диском после запуска и под реальной учебной нагрузкой.

## Подключить HTTPS

В существующий блок сайта Cardo добавь обработчики из infra/caddy/tools.caddy до общего application fallback. Они сохраняют /tools в адресе upstream; приложения настроены на такие префиксы. Используются loopback-порты 3003, 8085 и 5602. При собственных портах поменяй upstream. Новый DNS и внешний порт брокера не нужны.

Проверь конфигурацию установленным Caddy перед reload. Не заменяй целиком действующий Caddyfile: там могут находиться SQL TLS proxy и прежние правила. Не меняй DNS/IP вместе с этим выпуском.

После reload проверь вход, Secure-cookie, загрузку ресурсов и навигацию:

- /tools/grafana/d/cardo-overview
- /tools/kafka/
- /tools/kibana/s/cardo/app/discover

Без входа дашборды, темы и журналы не должны читаться. У student права чтения; административные пароли в материалы не включать. Prometheus, Elasticsearch и Kafka не публикуются в HTTPS proxy.

## Связать с E-QA и проверить результат

В закрытом серверном окружении E-QA укажи CARDO_KAFKA_UI_URL, CARDO_GRAFANA_URL, CARDO_KIBANA_URL и CARDO_STUDENT_TOOLS_PASSWORD. Последнее значение — только пароль общего read-only student, не пароль сервиса или администратора. Страница проекта отдаёт его после requireLearningAccess. Собери и выпусти проверенные материалы E-QA в обычном порядке; прогресс, доски и уже выданные задания не переписывать.

На отдельном вымышленном аккаунте выполни обычную операцию. Сопоставь ответ, безопасное событие, обработку и результат по requestId/eventId. Проверь реальные данные в Grafana и Kibana и отсутствие доступа student к записи, рабочей теме и настройкам. Сверь состав и число прежних таблиц/аккаунтов, SQL-права и подписки. Измерь ресурсы после завершения setup и проверь путь из сети учеников.

## Откат

Верни проверенные исходники и образы прошлого выпуска, прежний proxy и Compose с HTTP-доставкой outbox. Сохрани текущие PostgreSQL и новые volumes инструментов. При возврате после частично обработанных операций учитывай существующий inbox и delivered_at; не сбрасывай offset и не повторяй деньги вручную. Восстановление финансовой БД из старого дампа не является обычным откатом приложения.
