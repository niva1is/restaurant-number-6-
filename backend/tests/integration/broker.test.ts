/**
 * Сквозная проверка сложной инженерной задачи (раздел 11 ТЗ):
 * HTTP → PostgreSQL → RabbitMQ → consumer → Socket.io → панель официанта, без polling БД.
 *
 * Требуются запущенные PostgreSQL и RabbitMQ (docker compose up -d). Тесты идут в отдельном vhost qr_test.
 * Если брокер недоступен, набор пропускается.
 */
import amqp from 'amqplib';
import request from 'supertest';
import { io, Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BROKER, WSEvent } from '../../src/constants/enums';
import { prisma } from '../../src/lib/prisma';
import { rabbitMQService } from '../../src/modules/notifications/rabbitmq.service';
import { buildWaiterCallMessage } from '../../src/modules/notifications/waiterCall.message';
import type { WaiterCallEventPayload } from '../../src/modules/notifications/websocket.service';
import { RunningServer, startServer } from '../../src/server';
import { bearer, createStaff, login, migrateTestDatabase, resetDatabase, tableHeader } from './helpers';

const brokerUrl = process.env.RABBITMQ_URL!;

/** Создаёт vhost qr_test через Management API (нужен один раз). */
const ensureVhost = async (): Promise<boolean> => {
  const url = new URL(brokerUrl);
  const vhost = decodeURIComponent(url.pathname.slice(1));
  const auth = Buffer.from(`${decodeURIComponent(url.username)}:${decodeURIComponent(url.password)}`).toString('base64');
  try {
    const res = await fetch(`http://${url.hostname}:15672/api/vhosts/${encodeURIComponent(vhost)}`, {
      method: 'PUT',
      headers: { Authorization: `Basic ${auth}`, 'content-type': 'application/json' },
      body: '{}',
    });
    if (!res.ok) return false;
    const connection = await amqp.connect(brokerUrl);
    await connection.close();
    return true;
  } catch {
    return false;
  }
};

let brokerAvailable = false;

/** Тест выполняется только при доступном брокере, иначе помечается как пропущенный. */
const brokerIt = (name: string, fn: () => Promise<void>) =>
  it(name, async (ctx) => {
    if (!brokerAvailable) ctx.skip();
    await fn();
  });

const waitForEvent = <T>(socket: Socket, event: string, timeoutMs = 5000): Promise<T> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Событие ${event} не пришло за ${timeoutMs} мс`)), timeoutMs);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });

const connectSocket = (port: number, namespace: string, auth: Record<string, string>): Promise<Socket> =>
  new Promise((resolve, reject) => {
    const socket = io(`http://localhost:${port}${namespace}`, { auth, transports: ['websocket'], reconnection: false });
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', (err) => {
      socket.close();
      reject(err);
    });
  });

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('Вызов официанта через RabbitMQ + WebSocket (BE-09, раздел 11)', () => {
  let server: RunningServer;
  let waiterToken = '';
  let cookToken = '';
  const tables: Array<{ id: number; tableToken: string }> = [];
  let dishId = 0;
  const sockets: Socket[] = [];

  beforeAll(async () => {
    brokerAvailable = await ensureVhost();
    if (!brokerAvailable) {
      console.warn('[broker.test] RabbitMQ недоступен — тесты брокера пропущены (docker compose up -d)');
      return;
    }
    migrateTestDatabase();
    await resetDatabase();
    await createStaff();

    const restaurant = await prisma.restaurant.create({ data: { name: 'Test' } });
    for (const number of ['1', '2', '3']) {
      tables.push(await prisma.table.create({ data: { restaurantId: restaurant.id, number } }));
    }
    const category = await prisma.category.create({ data: { restaurantId: restaurant.id, name: 'Напитки' } });
    dishId = (await prisma.dish.create({ data: { categoryId: category.id, name: 'Чай', price: 150 } })).id;

    // Очередь тестового vhost могла остаться от прошлого запуска
    const connection = await amqp.connect(brokerUrl);
    const channel = await connection.createChannel();
    await channel.deleteQueue(BROKER.WAITER_CALLS_QUEUE).catch(() => undefined);
    await connection.close();

    server = await startServer(0);
    waiterToken = await login(server.server as never, 'waiter');
    cookToken = await login(server.server as never, 'cook');
  });

  afterAll(async () => {
    sockets.forEach((s) => s.close());
    await server?.stop();
  });

  brokerIt('WebSocket персонала не принимает подключение без JWT', async () => {
    await expect(connectSocket(server.port, '/', {})).rejects.toThrow(/UNAUTHORIZED/);
    await expect(connectSocket(server.port, '/', { token: 'forged.jwt.token' })).rejects.toThrow(/UNAUTHORIZED/);
  });

  brokerIt('гостевой namespace не принимает неверный токен стола', async () => {
    await expect(
      connectSocket(server.port, '/guest', { tableToken: '00000000-0000-4000-8000-000000000000' }),
    ).rejects.toThrow(/INVALID_TABLE_TOKEN/);
  });

  brokerIt('вызов доходит до панели официанта через брокер; повтор сообщения не создаёт дубль', async () => {
    const waiter = await connectSocket(server.port, '/', { token: waiterToken });
    sockets.push(waiter);
    const received: WaiterCallEventPayload[] = [];
    waiter.on(WSEvent.NEW_WAITER_CALL, (p: WaiterCallEventPayload) => received.push(p));

    const firstEvent = waitForEvent<WaiterCallEventPayload>(waiter, WSEvent.NEW_WAITER_CALL);
    const res = await request(server.server).post('/api/v1/notifications/call-waiter').set(tableHeader(tables[0].tableToken));

    expect(res.status).toBe(201);
    expect(res.body.delivery).toBe('broker');
    const event = await firstEvent;
    expect(event).toMatchObject({ eventId: res.body.call.eventId, type: 'WAITER_CALL', tableId: tables[0].id, tableNumber: '1' });
    expect(new Date(event.timestamp).toISOString()).toBe(event.timestamp);

    const saved = await prisma.waiterCall.findUniqueOrThrow({ where: { id: event.eventId } });
    expect(saved.status).toBe('PENDING');
    expect(saved.publishedAt).not.toBeNull();

    // Сообщение удерживается без ack, пока официант не примет вызов
    expect(rabbitMQService.waiterCallConsumer.pendingCount).toBe(1);

    // Повторная доставка того же сообщения (например, повторная публикация) — дубля нет
    const connection = await amqp.connect(brokerUrl);
    const channel = await connection.createChannel();
    channel.publish(
      BROKER.EXCHANGE,
      BROKER.WAITER_CALL_CREATED_KEY,
      Buffer.from(JSON.stringify(buildWaiterCallMessage({ id: saved.id, tableId: tables[0].id, tableNumber: '1', createdAt: saved.createdAt }))),
      { persistent: true },
    );
    await channel.close();
    await connection.close();
    await sleep(700);

    expect(received).toHaveLength(1);
    expect(rabbitMQService.waiterCallConsumer.pendingCount).toBe(1);
    expect(await prisma.waiterCall.count({ where: { tableId: tables[0].id } })).toBe(1);

    // Официант принимает вызов → RESOLVED, ack в RabbitMQ, событие для других официантов
    const resolvedEvent = waitForEvent<{ eventId: string }>(waiter, WSEvent.WAITER_CALL_RESOLVED);
    const resolve = await request(server.server)
      .post(`/api/v1/notifications/call-waiter/${event.eventId}/resolve`)
      .set(bearer(waiterToken));
    expect(resolve.status).toBe(200);
    expect((await resolvedEvent).eventId).toBe(event.eventId);
    expect(rabbitMQService.waiterCallConsumer.pendingCount).toBe(0);
  });

  brokerIt('гость получает смену статуса своего заказа без перезагрузки (FE-03)', async () => {
    const guest = await connectSocket(server.port, '/guest', { tableToken: tables[1].tableToken });
    sockets.push(guest);

    const order = await request(server.server)
      .post('/api/v1/orders')
      .set(tableHeader(tables[1].tableToken))
      .send({ items: [{ dishId, quantity: 1 }] });
    expect(order.status).toBe(201);

    const statusEvent = waitForEvent<{ orderId: number; toStatus: string }>(guest, WSEvent.ORDER_STATUS_CHANGED);
    await request(server.server)
      .patch(`/api/v1/orders/${order.body.id}/status`)
      .set(bearer(cookToken))
      .send({ status: 'COOKING' });

    expect(await statusEvent).toMatchObject({ orderId: order.body.id, toStatus: 'COOKING' });
  });

  brokerIt('непринятый вызов переживает перезапуск сервера: брокер доставляет его снова с тем же eventId (NFR-09)', async () => {
    const res = await request(server.server).post('/api/v1/notifications/call-waiter').set(tableHeader(tables[2].tableToken));
    expect(res.status).toBe(201);
    const eventId = res.body.call.eventId as string;
    await sleep(300);

    // Сервер останавливается, не дождавшись официанта: сообщение не подтверждено и возвращается в очередь
    sockets.forEach((s) => s.close());
    await server.stop();

    const connection = await amqp.connect(brokerUrl);
    const channel = await connection.createChannel();
    const queue = await channel.checkQueue(BROKER.WAITER_CALLS_QUEUE);
    await connection.close();
    // Ровно одно сообщение ждёт в очереди — непринятый вызов; принятый ранее подтверждён и удалён
    expect(queue.messageCount).toBe(1);

    // Новый экземпляр сервера: consumer снова получает то же сообщение и удерживает его до ack
    server = await startServer(0);
    for (let i = 0; i < 30 && rabbitMQService.waiterCallConsumer.pendingCount === 0; i += 1) await sleep(100);
    expect(rabbitMQService.waiterCallConsumer.pendingCount).toBe(1);

    // Панель официанта, открытая после рестарта, восстанавливает вызов из серверного состояния
    const token = await login(server.server as never, 'waiter');
    const active = await request(server.server).get('/api/v1/notifications/calls/active').set(bearer(token));
    expect(active.body.map((c: { eventId: string }) => c.eventId)).toEqual([eventId]);
    expect(await prisma.waiterCall.count({ where: { tableId: tables[2].id } })).toBe(1);

    // Принятие вызова подтверждает сообщение, доставленное уже новому экземпляру
    await request(server.server).post(`/api/v1/notifications/call-waiter/${eventId}/resolve`).set(bearer(token));
    expect(rabbitMQService.waiterCallConsumer.pendingCount).toBe(0);
  });
});
