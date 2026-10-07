/**
 * Сквозной сценарий критериев приёмки (раздел 12 ТЗ) через HTTP API на реальной PostgreSQL.
 * Требуется запущенный PostgreSQL (docker compose up -d) с БД qr_restaurant_test.
 */
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import { createApp } from '../../src/app';
import { prisma } from '../../src/lib/prisma';
import { bearer, createStaff, login, migrateTestDatabase, resetDatabase, tableHeader } from './helpers';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

let app: Express;
const tokens: Record<'admin' | 'cook' | 'waiter', string> = { admin: '', cook: '', waiter: '' };
const state = {
  tableId: 0,
  tableToken: '',
  categoryId: 0,
  pizzaId: 0,
  coffeeId: 0,
  orderId: 0,
};

beforeAll(async () => {
  migrateTestDatabase();
  await resetDatabase();
  await createStaff();
  app = createApp();
  tokens.admin = await login(app, 'admin');
  tokens.cook = await login(app, 'cook');
  tokens.waiter = await login(app, 'waiter');
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('1. Администратор создаёт стол, QR и меню (BE-01, BE-03)', () => {
  it('создаёт стол с непредсказуемым токеном UUID v4', async () => {
    const res = await request(app).post('/api/v1/tables').set(bearer(tokens.admin)).send({ number: '7' });

    expect(res.status).toBe(201);
    expect(res.body.tableToken).toMatch(UUID_V4);
    expect(res.body.qrUrl).toContain(`/table/${res.body.tableToken}`);
    state.tableId = res.body.id;
    state.tableToken = res.body.tableToken;
  });

  it('генерирует QR-код стола', async () => {
    const res = await request(app).get(`/api/v1/tables/${state.tableId}/qr`).set(bearer(tokens.admin));
    expect(res.status).toBe(200);
    expect(res.body.qrDataUrl).toMatch(/^data:image\/png;base64,/);
  });

  it('создаёт категорию и блюда с ингредиентами и калорийностью', async () => {
    const category = await request(app)
      .post('/api/v1/menu/categories')
      .set(bearer(tokens.admin))
      .send({ name: 'Пицца', sortOrder: 1 });
    expect(category.status).toBe(201);
    state.categoryId = category.body.id;

    const pizza = await request(app)
      .post('/api/v1/menu/dishes')
      .set(bearer(tokens.admin))
      .send({
        categoryId: state.categoryId,
        name: 'Маргарита',
        description: 'Томаты, моцарелла',
        price: 590,
        calories: 820,
        ingredients: ['Тесто', 'Моцарелла', 'моцарелла', 'Томаты'],
      });
    expect(pizza.status).toBe(201);
    expect(pizza.body).toMatchObject({ name: 'Маргарита', price: 590, calories: 820, isAvailable: true });
    expect(pizza.body.ingredients).toEqual(['Моцарелла', 'Тесто', 'Томаты']);
    state.pizzaId = pizza.body.id;

    const coffee = await request(app)
      .post('/api/v1/menu/dishes')
      .set(bearer(tokens.admin))
      .send({ categoryId: state.categoryId, name: 'Капучино', price: 220.5 });
    state.coffeeId = coffee.body.id;
  });

  it('изменение блюда сразу отражается в меню', async () => {
    await request(app).patch(`/api/v1/menu/dishes/${state.coffeeId}`).set(bearer(tokens.admin)).send({ calories: 120 });
    const menu = await request(app).get('/api/v1/menu');
    const coffee = menu.body[0].dishes.find((d: { id: number }) => d.id === state.coffeeId);
    expect(coffee.calories).toBe(120);
  });

  it('не-администратор не может менять меню (403), гость без JWT — 401', async () => {
    const asCook = await request(app)
      .post('/api/v1/menu/dishes')
      .set(bearer(tokens.cook))
      .send({ categoryId: state.categoryId, name: 'X', price: 1 });
    expect(asCook.status).toBe(403);

    const anonymous = await request(app).post('/api/v1/tables').send({ number: '8' });
    expect(anonymous.status).toBe(401);
  });

  it('невалидные данные отклоняются с понятной ошибкой 400', async () => {
    const res = await request(app)
      .post('/api/v1/menu/dishes')
      .set(bearer(tokens.admin))
      .send({ categoryId: state.categoryId, name: '', price: -5 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.map((d: { field: string }) => d.field)).toEqual(expect.arrayContaining(['name', 'price']));
  });
});

describe('2. Гость без авторизации оформляет заказ (BE-04, BE-05, BE-06)', () => {
  it('открывает стол по QR-токену — сессия получает контекст стола', async () => {
    const res = await request(app).get(`/api/v1/tables/check/${state.tableToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ valid: true, table: { id: state.tableId, number: '7' } });
  });

  it('несуществующий или подобранный токен не принимается', async () => {
    const fake = await request(app).get('/api/v1/tables/check/00000000-0000-4000-8000-000000000000');
    expect(fake.status).toBe(404);

    const byId = await request(app).get(`/api/v1/tables/check/${state.tableId}`);
    expect(byId.status).toBe(404);

    const order = await request(app)
      .post('/api/v1/orders')
      .set(tableHeader('00000000-0000-4000-8000-000000000000'))
      .send({ items: [{ dishId: state.pizzaId, quantity: 1 }] });
    expect(order.status).toBe(401);
  });

  it('видит меню без регистрации', async () => {
    const res = await request(app).get('/api/v1/menu');
    expect(res.status).toBe(200);
    expect(res.body[0].dishes).toHaveLength(2);
  });

  it('сервер подтверждает итог корзины (quote)', async () => {
    const res = await request(app)
      .post('/api/v1/orders/quote')
      .set(tableHeader(state.tableToken))
      .send({ items: [{ dishId: state.pizzaId, quantity: 2 }, { dishId: state.coffeeId, quantity: 1 }] });
    expect(res.status).toBe(200);
    expect(res.body.totalAmount).toBe(1400.5);
  });

  it('создаёт заказ: статус ACCEPTED, цены взяты с сервера, а не из запроса', async () => {
    const res = await request(app)
      .post('/api/v1/orders')
      .set(tableHeader(state.tableToken))
      .send({
        items: [
          { dishId: state.pizzaId, quantity: 2, price: 1 },
          { dishId: state.coffeeId, quantity: 1 },
        ],
        comment: 'Без лука',
        expectedTotal: 1400.5,
      });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: 'ACCEPTED', tableId: state.tableId, totalAmount: 1400.5 });
    expect(res.body.items[0]).toMatchObject({ dishName: 'Маргарита', quantity: 2, orderedPrice: 590, lineTotal: 1180 });
    state.orderId = res.body.id;
  });

  it('если цена изменилась, а гость видел старую сумму — 409 PRICE_CHANGED, заказ не создан', async () => {
    const before = await prisma.order.count();
    const res = await request(app)
      .post('/api/v1/orders')
      .set(tableHeader(state.tableToken))
      .send({ items: [{ dishId: state.pizzaId, quantity: 1 }], expectedTotal: 500 });
    expect(res.status).toBe(409);
    expect(res.body.error.details.actualTotal).toBe(590);
    expect(await prisma.order.count()).toBe(before);
  });

  it('гость видит статус своего заказа', async () => {
    const res = await request(app).get('/api/v1/orders/my').set(tableHeader(state.tableToken));
    expect(res.status).toBe(200);
    expect(res.body.map((o: { id: number }) => o.id)).toContain(state.orderId);
  });
});

describe('3–4. Кухня и официант ведут заказ по state machine (BE-07, BE-08)', () => {
  const setStatus = (token: string, status: string) =>
    request(app).patch(`/api/v1/orders/${state.orderId}/status`).set(bearer(token)).send({ status });

  it('кухня видит заказ в витрине активных', async () => {
    const res = await request(app).get('/api/v1/orders/active').set(bearer(tokens.cook));
    expect(res.status).toBe(200);
    const order = res.body.find((o: { id: number }) => o.id === state.orderId);
    expect(order.availableTransitions).toEqual(['COOKING', 'CANCELLED']);
    expect(order.waitingSeconds).toBeGreaterThanOrEqual(0);
  });

  it('недопустимый переход ACCEPTED → PAID отклоняется (400)', async () => {
    const res = await setStatus(tokens.admin, 'PAID');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_STATUS_TRANSITION');
  });

  it('официант не может начать готовку (403)', async () => {
    const res = await setStatus(tokens.waiter, 'COOKING');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('TRANSITION_FORBIDDEN_FOR_ROLE');
  });

  it('повар: ACCEPTED → COOKING → READY', async () => {
    expect((await setStatus(tokens.cook, 'COOKING')).body.status).toBe('COOKING');
    expect((await setStatus(tokens.cook, 'READY')).body.status).toBe('READY');
  });

  it('повар не может подать заказ, официант не может закрыть оплату (403)', async () => {
    expect((await setStatus(tokens.cook, 'SERVED')).status).toBe(403);
  });

  it('официант: READY → SERVED; оплату закрывает администратор: SERVED → PAID', async () => {
    expect((await setStatus(tokens.waiter, 'SERVED')).body.status).toBe('SERVED');
    expect((await setStatus(tokens.waiter, 'PAID')).status).toBe(403);
    expect((await setStatus(tokens.admin, 'PAID')).body.status).toBe('PAID');
  });

  it('из PAID переходов нет', async () => {
    expect((await setStatus(tokens.admin, 'CANCELLED')).status).toBe(400);
  });

  it('одновременная смена статуса двумя сотрудниками: успешна только одна (конкурентность)', async () => {
    const order = await request(app)
      .post('/api/v1/orders')
      .set(tableHeader(state.tableToken))
      .send({ items: [{ dishId: state.coffeeId, quantity: 1 }] });

    const results = await Promise.all(
      [1, 2, 3].map(() =>
        request(app).patch(`/api/v1/orders/${order.body.id}/status`).set(bearer(tokens.cook)).send({ status: 'COOKING' }),
      ),
    );
    const statuses = results.map((r) => r.status).sort();
    expect(statuses.filter((s) => s === 200)).toHaveLength(1);
    expect(statuses.every((s) => s === 200 || s === 409 || s === 400)).toBe(true);

    const events = await prisma.orderStatusEvent.count({ where: { orderId: order.body.id, toStatus: 'COOKING' } });
    expect(events).toBe(1);
  });
});

describe('Аудит статусов: время и инициатор (BE-11)', () => {
  it('каждый переход записан с ролью, пользователем и временем ISO 8601', async () => {
    const res = await request(app).get(`/api/v1/orders/${state.orderId}`).set(bearer(tokens.admin));
    expect(res.status).toBe(200);

    const history = res.body.history as Array<{ fromStatus: string | null; toStatus: string; actor: string; user: { username: string } | null; timestamp: string }>;
    expect(history.map((h) => `${h.fromStatus ?? '∅'}→${h.toStatus}:${h.actor}:${h.user?.username ?? 'guest'}`)).toEqual([
      '∅→ACCEPTED:GUEST:guest',
      'ACCEPTED→COOKING:COOK:cook',
      'COOKING→READY:COOK:cook',
      'READY→SERVED:WAITER:waiter',
      'SERVED→PAID:ADMIN:admin',
    ]);
    for (const h of history) expect(new Date(h.timestamp).toISOString()).toBe(h.timestamp);
  });
});

describe('Снимок цены: изменение меню не меняет счёт (BE-06)', () => {
  it('после подорожания блюда сумма созданного заказа прежняя', async () => {
    await request(app).patch(`/api/v1/menu/dishes/${state.pizzaId}`).set(bearer(tokens.admin)).send({ price: 990 });

    const order = await request(app).get(`/api/v1/orders/${state.orderId}`).set(bearer(tokens.admin));
    expect(order.body.totalAmount).toBe(1400.5);
    expect(order.body.items[0].orderedPrice).toBe(590);

    const menu = await request(app).get(`/api/v1/menu/dishes/${state.pizzaId}`);
    expect(menu.body.price).toBe(990);
  });

  it('удаление блюда не ломает историю заказа (снимок названия)', async () => {
    const extra = await request(app)
      .post('/api/v1/menu/dishes')
      .set(bearer(tokens.admin))
      .send({ categoryId: state.categoryId, name: 'Сезонный суп', price: 300 });
    const order = await request(app)
      .post('/api/v1/orders')
      .set(tableHeader(state.tableToken))
      .send({ items: [{ dishId: extra.body.id, quantity: 1 }] });

    expect((await request(app).delete(`/api/v1/menu/dishes/${extra.body.id}`).set(bearer(tokens.admin))).status).toBe(204);

    const saved = await request(app).get(`/api/v1/orders/${order.body.id}`).set(bearer(tokens.admin));
    expect(saved.body.items[0]).toMatchObject({ dishId: null, dishName: 'Сезонный суп', orderedPrice: 300 });
  });
});

describe('5. Стоп-лист запрещает заказ блюда (BE-02)', () => {
  it('повар ставит блюдо в стоп-лист — в меню оно isAvailable: false', async () => {
    const res = await request(app).patch(`/api/v1/menu/dishes/${state.coffeeId}/stop-list`).set(bearer(tokens.cook));
    expect(res.status).toBe(200);
    expect(res.body.isAvailable).toBe(false);

    const menu = await request(app).get('/api/v1/menu');
    expect(menu.body[0].dishes.find((d: { id: number }) => d.id === state.coffeeId).isAvailable).toBe(false);
  });

  it('заказ с блюдом из стоп-листа отклоняется сервером (400) и не создаётся', async () => {
    const before = await prisma.order.count();
    const res = await request(app)
      .post('/api/v1/orders')
      .set(tableHeader(state.tableToken))
      .send({ items: [{ dishId: state.pizzaId, quantity: 1 }, { dishId: state.coffeeId, quantity: 1 }] });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('DISH_IN_STOP_LIST');
    expect(res.body.error.message).toContain('Капучино');
    expect(await prisma.order.count()).toBe(before);
  });

  it('официант не может управлять стоп-листом (403)', async () => {
    const res = await request(app).patch(`/api/v1/menu/dishes/${state.coffeeId}/stop-list`).set(bearer(tokens.waiter));
    expect(res.status).toBe(403);
  });

  it('после снятия со стоп-листа блюдо снова можно заказать', async () => {
    await request(app)
      .patch(`/api/v1/menu/dishes/${state.coffeeId}/stop-list`)
      .set(bearer(tokens.admin))
      .send({ isAvailable: true });
    const res = await request(app)
      .post('/api/v1/orders')
      .set(tableHeader(state.tableToken))
      .send({ items: [{ dishId: state.coffeeId, quantity: 1 }] });
    expect(res.status).toBe(201);
  });
});

describe('6–7. Вызов официанта: rate limit и отсутствие дублей (BE-09, BE-10)', () => {
  let eventId = '';

  it('гость вызывает официанта — вызов сохраняется в БД (PENDING)', async () => {
    const res = await request(app).post('/api/v1/notifications/call-waiter').set(tableHeader(state.tableToken));
    expect(res.status).toBe(201);
    expect(res.body.duplicate).toBe(false);
    expect(res.body.call).toMatchObject({ type: 'WAITER_CALL', tableId: state.tableId, status: 'PENDING' });
    eventId = res.body.call.eventId;
  });

  it('повтор чаще 1 раза в 30 секунд — 429 Too Many Requests c Retry-After', async () => {
    const res = await request(app).post('/api/v1/notifications/call-waiter').set(tableHeader(state.tableToken));
    expect(res.status).toBe(429);
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    expect(Number(res.headers['retry-after'])).toBeLessThanOrEqual(30);
    expect(await prisma.waiterCall.count({ where: { tableId: state.tableId } })).toBe(1);
  });

  it('панель официанта восстанавливает активные вызовы из серверного состояния (NFR-09)', async () => {
    const res = await request(app).get('/api/v1/notifications/calls/active').set(bearer(tokens.waiter));
    expect(res.body.map((c: { eventId: string }) => c.eventId)).toEqual([eventId]);
  });

  it('повар не может снять вызов (403); официант принимает вызов один раз, повтор идемпотентен', async () => {
    expect(
      (await request(app).post(`/api/v1/notifications/call-waiter/${eventId}/resolve`).set(bearer(tokens.cook))).status,
    ).toBe(403);

    const first = await request(app).post(`/api/v1/notifications/call-waiter/${eventId}/resolve`).set(bearer(tokens.waiter));
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ alreadyResolved: false, call: { status: 'RESOLVED', resolvedBy: { username: 'waiter' } } });

    const second = await request(app).post(`/api/v1/notifications/call-waiter/${eventId}/resolve`).set(bearer(tokens.waiter));
    expect(second.status).toBe(200);
    expect(second.body.alreadyResolved).toBe(true);
    expect(second.body.call.resolvedAt).toBe(first.body.call.resolvedAt);
  });

  it('одновременные вызовы с одного стола создают не более одного активного вызова', async () => {
    const table = await request(app).post('/api/v1/tables').set(bearer(tokens.admin)).send({ number: '9' });

    const results = await Promise.all(
      [1, 2, 3, 4].map(() =>
        request(app).post('/api/v1/notifications/call-waiter').set(tableHeader(table.body.tableToken)),
      ),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.every((r) => [200, 201, 429].includes(r.status))).toBe(true);
    expect(await prisma.waiterCall.count({ where: { tableId: table.body.id, status: 'PENDING' } })).toBe(1);
  });
});
