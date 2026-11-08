import { randomUUID } from 'crypto';
import type { ConsumeMessage } from 'amqplib';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WaiterCallStatus } from '@prisma/client';
import { AckChannel, WaiterCallConsumer } from '../../src/modules/notifications/waiterCall.consumer';
import { buildWaiterCallMessage } from '../../src/modules/notifications/waiterCall.message';

const makeMessage = (body: unknown, redelivered = false): ConsumeMessage =>
  ({
    content: Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)),
    fields: { redelivered, deliveryTag: Math.floor(Math.random() * 1e6) },
    properties: {},
  }) as unknown as ConsumeMessage;

const makeChannel = (): AckChannel & { ack: ReturnType<typeof vi.fn>; nack: ReturnType<typeof vi.fn> } => ({
  ack: vi.fn(),
  nack: vi.fn(),
});

describe('Consumer очереди waiter_calls: подтверждение и идемпотентность', () => {
  const eventId = randomUUID();
  const body = buildWaiterCallMessage({ id: eventId, tableId: 3, tableNumber: '3', createdAt: new Date() });

  let status: WaiterCallStatus | null;
  let notify: ReturnType<typeof vi.fn>;
  let consumer: WaiterCallConsumer;

  beforeEach(() => {
    status = WaiterCallStatus.PENDING;
    notify = vi.fn();
    consumer = new WaiterCallConsumer({
      findCall: async () => (status ? { status } : null),
      notify,
      retryDelayMs: 0,
    });
  });

  it('новый вызов доставляется на панель официанта и ждёт подтверждения (ack не сразу)', async () => {
    const channel = makeChannel();
    const message = makeMessage(body);

    expect(await consumer.handle(channel, message)).toBe('delivered');
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ eventId, type: 'WAITER_CALL', tableId: 3, tableNumber: '3', redelivered: false }),
    );
    expect(channel.ack).not.toHaveBeenCalled();

    // Официант принял вызов → ack именно этого сообщения
    expect(consumer.acknowledge(eventId)).toBe(true);
    expect(channel.ack).toHaveBeenCalledWith(message);
    expect(consumer.pendingCount).toBe(0);
  });

  it('повторная доставка того же event_id не создаёт второй вызов на панели (критерий приёмки 7)', async () => {
    const channel = makeChannel();
    await consumer.handle(channel, makeMessage(body));
    const duplicate = makeMessage(body, true);

    expect(await consumer.handle(channel, duplicate)).toBe('duplicate');
    expect(notify).toHaveBeenCalledTimes(1);
    expect(channel.ack).toHaveBeenCalledWith(duplicate);
    expect(consumer.pendingCount).toBe(1);
  });

  it('сообщение по уже принятому (RESOLVED) вызову подтверждается без доставки', async () => {
    status = WaiterCallStatus.RESOLVED;
    const channel = makeChannel();
    const message = makeMessage(body, true);

    expect(await consumer.handle(channel, message)).toBe('stale');
    expect(notify).not.toHaveBeenCalled();
    expect(channel.ack).toHaveBeenCalledWith(message);
  });

  it('после потери канала брокер доставляет заново — та же карточка (тот же eventId), redelivered=true', async () => {
    const oldChannel = makeChannel();
    await consumer.handle(oldChannel, makeMessage(body));
    consumer.forgetChannel(oldChannel);

    const newChannel = makeChannel();
    expect(await consumer.handle(newChannel, makeMessage(body, true))).toBe('delivered');
    expect(notify).toHaveBeenLastCalledWith(expect.objectContaining({ eventId, redelivered: true }));
  });

  it('повреждённое сообщение уходит в DLQ (nack без возврата в очередь)', async () => {
    const channel = makeChannel();
    const broken = makeMessage('{"event_id": "not-a-uuid"');

    expect(await consumer.handle(channel, broken)).toBe('invalid');
    expect(channel.nack).toHaveBeenCalledWith(broken, false, false);
    expect(notify).not.toHaveBeenCalled();
  });

  it('при недоступной БД сообщение возвращается в очередь для повторной попытки', async () => {
    consumer = new WaiterCallConsumer({
      findCall: async () => {
        throw new Error('db down');
      },
      notify,
      retryDelayMs: 0,
    });
    const channel = makeChannel();
    const message = makeMessage(body);

    expect(await consumer.handle(channel, message)).toBe('retry');
    expect(channel.nack).toHaveBeenCalledWith(message, false, true);
  });

  it('повторное подтверждение безопасно', () => {
    expect(consumer.acknowledge(randomUUID())).toBe(false);
  });
});
