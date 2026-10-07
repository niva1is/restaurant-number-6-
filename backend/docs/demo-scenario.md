# Демонстрационный сценарий (5–10 минут)

Подготовка: `docker compose up -d && npx prisma migrate deploy && npx prisma db seed && npm run dev`.
Откройте Swagger UI `http://localhost:5000/api/docs`. Токены персонала получите через `POST /auth/login`
и вставьте в **Authorize → bearerAuth**. Токен стола вставьте в **Authorize → tableToken**.

| # | Шаг | Запрос | Ожидаемый результат |
|---|---|---|---|
| 1 | Вход администратора | `POST /auth/login` `{admin, admin123}` | 200, JWT, роль ADMIN |
| 2 | Создать стол | `POST /tables` `{"number":"6"}` | 201, `tableToken` — UUID v4, `qrUrl` |
| 3 | QR-код стола | `GET /tables/{id}/qr` | 200, `qrDataUrl` (PNG) |
| 4 | Наполнить меню | `POST /menu/categories`, `POST /menu/dishes` | 201, блюдо с ингредиентами и калорийностью |
| 5 | Гость сканирует QR | `GET /tables/check/{token}` | 200, контекст стола (без регистрации) |
| 6 | Гость смотрит меню | `GET /menu` | Тирамису с `isAvailable: false` (стоп-лист) |
| 7 | Стоп-лист запрещает заказ | `POST /orders` с Тирамису | **400 DISH_IN_STOP_LIST** |
| 8 | Гость оформляет заказ | `POST /orders` `{"items":[{"dishId":1,"quantity":2}]}` | 201, `ACCEPTED`, `orderedPrice` |
| 9 | Кухня видит заказ | `GET /orders/active` (cook) | заказ, `waitingSeconds`, кнопки `availableTransitions` |
| 10 | **Недопустимый переход** | `PATCH /orders/{id}/status` `{"status":"PAID"}` | **400 INVALID_STATUS_TRANSITION** |
| 11 | **Чужая роль** | то же под waiter `{"status":"COOKING"}` | **403 TRANSITION_FORBIDDEN_FOR_ROLE** |
| 12 | Кухня готовит | cook: `COOKING`, затем `READY` | 200 |
| 13 | Официант подаёт | waiter: `SERVED` | 200 |
| 14 | Оплата | admin: `PAID` | 200 |
| 15 | Аудит | `GET /orders/{id}` | `history`: 5 записей с ролью, пользователем и временем |
| 16 | Снимок цены | `PATCH /menu/dishes/1` `{"price":999}`, затем `GET /orders/{id}` | сумма заказа не изменилась |
| 17 | Вызов официанта | `POST /notifications/call-waiter` | 201, `delivery: "broker"`. В RabbitMQ UI в очереди `waiter_calls` одно Unacked-сообщение |
| 18 | **Rate limit** | повторить шаг 17 сразу | **429**, заголовок `Retry-After` |
| 19 | Панель официанта | `GET /notifications/calls/active` (waiter) | вызов с номером стола и временем |
| 20 | Официант принимает | `POST /notifications/call-waiter/{eventId}/resolve` | 200, `RESOLVED`; в RabbitMQ UI очередь пуста (ack) |
| 21 | Повтор принятия | повторить шаг 20 | 200, `alreadyResolved: true` — без изменений |

Доставку без polling наглядно показывает автотест `tests/integration/broker.test.ts`
(`npx vitest run tests/integration/broker.test.ts`). Он подключается к Socket.io как официант и получает
`NEW_WAITER_CALL` из RabbitMQ.
