# QR Restaurant — Backend

REST API платформы цифрового обслуживания ресторана: гость сканирует QR-код стола и оформляет заказ
без регистрации, кухня ведёт приготовление, официант получает готовые заказы и мгновенные вызовы от столов.

**Стек:** Node.js 20+ · TypeScript · Express 5 · Prisma 6 · PostgreSQL 16 · RabbitMQ 3.13 · Socket.io 4 · Zod · JWT + bcrypt · Vitest + Supertest · Docker Compose

| | |
|---|---|
| API | `http://localhost:5000/api/v1` |
| Swagger UI | `http://localhost:5000/api/docs` (спецификация: [`docs/openapi.yaml`](docs/openapi.yaml)) |
| RabbitMQ UI | `http://localhost:15672` (guest / guest) |
| Документация | [ER-модель](docs/er-diagram.md) · [Архитектура и очереди](docs/architecture.md) · [Демо-сценарий](docs/demo-scenario.md) · [Скриншоты](docs/screenshots/) |

---

## Быстрый старт

Нужны **Node.js 20+** и **Docker** (Docker Desktop / Rancher Desktop).

### Вариант А — разработка (инфраструктура в Docker, бэкенд локально)

```bash
cd backend
cp .env.example .env          # переменные окружения (секреты в Git не попадают)
npm install
docker compose up -d          # PostgreSQL + RabbitMQ
npx prisma migrate deploy     # схема БД из prisma/migrations
npx prisma db seed            # демо-данные: персонал, столы, меню
npm run dev                   # http://localhost:5000
```

### Вариант Б — всё в Docker одной командой

```bash
cd backend
cp .env.example .env
docker compose --profile full up -d --build
```

Контейнер бэкенда при старте сам применяет миграции и сид. Проверка: `curl http://localhost:5000/api/v1/health`.

> Если порт 5432 занят локально установленным PostgreSQL, остановите его службу или поменяйте проброс порта в `docker-compose.yml` и `DATABASE_URL`.

## Тестовые учётные записи

| Роль | Логин | Пароль | Что может |
|---|---|---|---|
| Администратор | `admin` | `admin123` | меню, стоп-лист, столы и QR, SERVED → PAID, отмена |
| Повар | `cook` | `cook123` | ACCEPTED → COOKING → READY, стоп-лист |
| Официант | `waiter` | `waiter123` | READY → SERVED, приём вызовов |
| Гость | — | — | заголовок `X-Table-Token: <UUID из QR>` |

Пароли задаются переменными `SEED_*_PASSWORD`. Токены столов — случайные UUID v4; сид печатает их ссылки.
Посмотреть токены позже можно через `GET /api/v1/tables` под администратором.

## Переменные окружения

| Переменная | По умолчанию | Назначение |
|---|---|---|
| `PORT` | `5000` | Порт HTTP и WebSocket |
| `NODE_ENV` | `development` | `development` / `production` / `test` |
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/qr_restaurant` | Подключение к PostgreSQL |
| `JWT_SECRET` | — (обязательно, ≥16 символов) | Подпись JWT персонала |
| `JWT_EXPIRES_IN` | `12h` | Срок жизни JWT |
| `RABBITMQ_URL` | `amqp://guest:guest@localhost:5672` | Подключение к RabbitMQ |
| `CORS_ORIGIN` | `http://localhost:5173` | Разрешённые origin фронтенда (через запятую, `*` — любой) |
| `PUBLIC_APP_URL` | `http://localhost:5173` | Адрес фронтенда для ссылки в QR: `<URL>/table/<token>` |
| `WAITER_CALL_COOLDOWN_SECONDS` | `30` | Интервал между вызовами официанта со стола |
| `POSTGRES_*`, `RABBITMQ_USER/PASSWORD` | `postgres`, `guest` | Учётные данные контейнеров |
| `SEED_ADMIN/COOK/WAITER_PASSWORD` | `admin123` … | Пароли демо-персонала |

Конфигурация проверяется при старте (`src/config/env.ts`): с неполной конфигурацией сервис не запустится и назовёт проблемную переменную.

## Команды

| Команда | Назначение |
|---|---|
| `npm run dev` | Сервер разработки с перезапуском при изменениях |
| `npm run build` / `npm start` | Сборка в `dist/` и запуск собранного сервера |
| `npm test` | Все тесты (unit + интеграционные) |
| `npm run test:unit` | Только unit-тесты (без БД и брокера) |
| `npm run typecheck` | Проверка типов TypeScript |
| `npx prisma migrate deploy` | Применить миграции |
| `npx prisma migrate dev --name <имя>` | Создать новую миграцию после изменения схемы |
| `npx prisma db seed` | Заполнить демо-данные (идемпотентно) |
| `npx prisma studio` | Просмотр БД в браузере |

## Тесты

```bash
docker compose up -d   # интеграционным тестам нужны PostgreSQL и RabbitMQ
npm test
```

73 теста: **35 unit** + **38 интеграционных**. Интеграционные работают с отдельной БД `qr_restaurant_test`
и отдельным vhost RabbitMQ `qr_test`, поэтому демо-данные не страдают.

| Файл | Что проверяет |
|---|---|
| `tests/unit/orderStateMachine.test.ts` | Все переходы state machine, 400 для несуществующих и 403 для чужой роли |
| `tests/unit/orderPricing.test.ts` | Серверный расчёт, снимок цены, стоп-лист, точность денег (Decimal) |
| `tests/unit/waiterCallRateLimit.test.ts` | Ограничение «1 вызов в 30 с со стола» |
| `tests/unit/waiterCallConsumer.test.ts` | Consumer: ack после принятия, дубли, DLQ, повторная доставка |
| `tests/integration/acceptance.test.ts` | Все критерии приёмки через HTTP: меню → заказ → кухня → официант → оплата, стоп-лист, аудит, 429, гонки |
| `tests/integration/broker.test.ts` | HTTP → RabbitMQ → Socket.io без polling, дубль сообщения, переживание перезапуска |

## API (кратко)

Полное описание с примерами — в Swagger UI (`/api/docs`).

| Метод | Путь | Доступ | Назначение |
|---|---|---|---|
| POST | `/auth/login` | все | Вход персонала, JWT |
| GET | `/auth/me` | персонал | Профиль |
| GET | `/menu` | все | Меню; блюда из стоп-листа с `isAvailable: false` |
| GET/POST/PATCH/DELETE | `/menu/categories[/:id]` | ADMIN (чтение — все) | CRUD категорий |
| GET/POST/PATCH/DELETE | `/menu/dishes[/:id]` | ADMIN (чтение — все) | CRUD блюд: цена, ингредиенты, калорийность |
| PATCH | `/menu/dishes/:id/stop-list` | ADMIN, COOK | Стоп-лист |
| GET | `/menu/stop-list`, `/menu/ingredients` | персонал / все | Стоп-лист, справочник ингредиентов |
| GET/POST/PATCH/DELETE | `/tables[/:id]` | ADMIN | Столы |
| POST | `/tables/:id/regenerate-token` | ADMIN | Перевыпуск токена стола |
| GET | `/tables/:id/qr?format=json\|svg\|png` | ADMIN | QR-код стола |
| GET | `/tables/check/:token` | гость | Проверка QR, контекст стола |
| POST | `/orders/quote` | гость | Расчёт корзины сервером |
| POST | `/orders` | гость | Создание заказа |
| GET | `/orders/my` | гость | Заказы своего стола |
| GET | `/orders/active?status=` | персонал | Очередь кухни / официанта |
| GET | `/orders/:id` | персонал | Заказ + история статусов |
| PATCH | `/orders/:id/status` | по роли | Смена статуса (state machine) |
| POST | `/notifications/call-waiter` | гость | Вызов официанта → RabbitMQ |
| POST | `/notifications/call-waiter/:eventId/resolve` | WAITER, ADMIN | Принять вызов (ack) |
| GET | `/notifications/calls/active` | WAITER, ADMIN | Активные вызовы |
| GET | `/health` | все | Состояние БД и брокера |

**WebSocket (Socket.io):** namespace `/` — персонал (`auth: { token: JWT }`), namespace `/guest` — гость
(`auth: { tableToken }`). События: `ORDER_CREATED`, `ORDER_STATUS_CHANGED`, `NEW_WAITER_CALL`,
`WAITER_CALL_RESOLVED`, `STOP_LIST_CHANGED`.

## State machine заказа

```
ACCEPTED ──COOK──▶ COOKING ──COOK──▶ READY ──WAITER──▶ SERVED ──ADMIN──▶ PAID
   │                  │                 │                 │
   └──COOK/ADMIN──────┴──ADMIN──────────┴──ADMIN──────────┴──▶ CANCELLED
```

Несуществующий переход → `400 INVALID_STATUS_TRANSITION`; переход не для этой роли → `403 TRANSITION_FORBIDDEN_FOR_ROLE`;
одновременная смена другим сотрудником → `409 ORDER_STATUS_CONFLICT`. Каждый переход пишется в `order_status_events`
со временем и инициатором.

## Структура

```
backend/
├── docker/                    # конфиги контейнеров (тестовая БД, consumer_timeout RabbitMQ)
├── docs/                      # OpenAPI, ER-модель, архитектура, демо-сценарий
├── prisma/
│   ├── schema.prisma          # модель данных
│   ├── migrations/            # SQL-миграции (в Git)
│   └── seed.ts                # демо-данные
├── src/
│   ├── config/env.ts          # загрузка и проверка .env (Zod)
│   ├── constants/             # перечисления, топология брокера, коды ошибок
│   ├── docs/swagger.ts        # Swagger UI
│   ├── lib/                   # Prisma Client, JWT
│   ├── middlewares/           # authenticate, authorize (roleCheck), requireTableToken, rate limit, ошибки
│   ├── modules/
│   │   ├── auth/              # вход персонала
│   │   ├── menu/              # категории, блюда, ингредиенты, стоп-лист
│   │   ├── tables/            # столы, QR, проверка токена
│   │   ├── orders/            # заказы, state machine, расчёт цены
│   │   ├── notifications/     # вызов официанта: RabbitMQ, consumer, Socket.io
│   │   └── restaurants/       # ресторан по умолчанию
│   ├── utils/                 # ApiError, деньги, общие валидаторы
│   ├── routes.ts              # реестр маршрутов /api/v1
│   ├── app.ts                 # Express: CORS, Helmet, JSON, rate limit, ошибки
│   └── server.ts              # точка входа: HTTP + WebSocket + RabbitMQ
├── tests/                     # unit- и интеграционные тесты
├── docker-compose.yml         # PostgreSQL + RabbitMQ (+ backend в профиле full)
└── Dockerfile
```

Каждый модуль разделён на слои: `*.routes.ts` (URL и доступ) → `*.validator.ts` (Zod, ошибка 400) →
`*.controller.ts` (HTTP) → `*.service.ts` (бизнес-логика, транзакции).

## Ключевые решения

- **Снимок цены (BE-06).** В `order_items` хранятся `ordered_price` и `dish_name` на момент заказа. Изменение
  или удаление блюда не меняет созданные счета.
- **Стоп-лист и цены проверяет сервер (BE-02, BE-05).** Цены из запроса игнорируются. Строки блюд в транзакции
  создания заказа блокируются `FOR SHARE`, чтобы заказ не прошёл с блюдом, которое в этот момент снимают.
- **Деньги — `DECIMAL(10,2)` и `Prisma.Decimal`**, без ошибок округления float.
- **Токен стола (BE-03)** — UUID v4 из `crypto.randomUUID()`, перевыпускается администратором. Гостевые запросы
  ограничены по IP. Токен стола и JWT персонала — разные механизмы.
- **Конкурентность.** Смена статуса — условный `UPDATE … WHERE status = <прочитанный>`, при гонке выигрывает один
  сотрудник. «Не более одного активного вызова на стол» гарантирует БД: `UNIQUE(active_table_id)` + `CHECK`.
- **Вызов официанта (BE-09…BE-11, раздел 11).** Факт вызова сохраняется в БД до публикации. Сообщение уходит в
  RabbitMQ с publisher confirm, consumer держит его без ack, пока официант не примет вызов. Повторная доставка
  дубля не создаёт. Если брокер недоступен, вызов публикуется после переподключения (outbox). Подробности —
  в [docs/architecture.md](docs/architecture.md).
