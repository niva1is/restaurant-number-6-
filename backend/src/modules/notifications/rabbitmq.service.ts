import amqp, { Channel, ChannelModel, ConfirmChannel } from 'amqplib';
import { config } from '../../config/env';
import { BROKER } from '../../constants/enums';
import { prisma } from '../../lib/prisma';
import { WaiterCallConsumer } from './waiterCall.consumer';
import { WaiterCallMessage } from './waiterCall.message';
import { websocketService } from './websocket.service';

const PUBLISH_TIMEOUT_MS = 5000;
const MAX_RECONNECT_DELAY_MS = 30_000;

/**
 * Подключение к RabbitMQ: топология, публикация с подтверждением брокера, consumer, переподключение.
 *
 * Топология:
 *   exchange restaurant.events (direct, durable)
 *     └─ routing key waiter_call.created → queue waiter_calls (durable, DLX = restaurant.events.dlx)
 *   exchange restaurant.events.dlx (fanout) → queue waiter_calls.dlq — повреждённые сообщения
 *
 * Если брокер недоступен, API продолжает работать: вызов уже сохранён в БД (published_at = NULL),
 * а после переподключения неопубликованные вызовы публикуются повторно (outbox).
 */
class RabbitMQService {
  private connection: ChannelModel | null = null;
  private publishChannel: ConfirmChannel | null = null;
  private consumeChannel: Channel | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempt = 0;
  private stopping = false;
  private readyHandlers: Array<() => Promise<void>> = [];

  readonly waiterCallConsumer = new WaiterCallConsumer({
    findCall: (eventId) => prisma.waiterCall.findUnique({ where: { id: eventId }, select: { status: true } }),
    notify: (payload) => websocketService.newWaiterCall(payload),
  });

  /** Подписка на событие «брокер (пере)подключён». */
  onReady(handler: () => Promise<void>): void {
    this.readyHandlers.push(handler);
  }

  isConnected(): boolean {
    return this.publishChannel !== null;
  }

  /** Первое подключение. Не бросает исключение: при неудаче запускается переподключение в фоне. */
  async start(): Promise<boolean> {
    this.stopping = false;
    try {
      await this.connect();
      return true;
    } catch (error) {
      console.warn(`[RabbitMQ] Брокер недоступен (${(error as Error).message}). Повторная попытка в фоне.`);
      this.scheduleReconnect();
      return false;
    }
  }

  private async connect(): Promise<void> {
    const connection = await amqp.connect(config.rabbitmqUrl, {
      clientProperties: { connection_name: 'qr-restaurant-backend' },
    });
    connection.on('error', (err) => console.error('[RabbitMQ] Ошибка соединения:', err.message));
    connection.on('close', () => this.handleDisconnect());

    try {
      const publishChannel = await connection.createConfirmChannel();
      await this.assertTopology(publishChannel);

      const consumeChannel = await connection.createChannel();
      // Неподтверждённые вызовы ждут официанта, поэтому prefetch больше 1 — иначе один вызов блокировал бы остальные.
      await consumeChannel.prefetch(100);
      consumeChannel.on('close', () => this.waiterCallConsumer.forgetChannel(consumeChannel));
      await consumeChannel.consume(
        BROKER.WAITER_CALLS_QUEUE,
        (message) => {
          if (message) void this.waiterCallConsumer.handle(consumeChannel, message);
        },
        { noAck: false },
      );

      this.connection = connection;
      this.publishChannel = publishChannel;
      this.consumeChannel = consumeChannel;
    } catch (error) {
      await connection.close().catch(() => undefined);
      throw error;
    }

    this.reconnectAttempt = 0;
    console.log(`[RabbitMQ] Подключено. Consumer слушает очередь ${BROKER.WAITER_CALLS_QUEUE}`);

    for (const handler of this.readyHandlers) {
      await handler().catch((err) => console.error('[RabbitMQ] Ошибка обработчика onReady:', err));
    }
  }

  private async assertTopology(channel: ConfirmChannel): Promise<void> {
    await channel.assertExchange(BROKER.EXCHANGE, 'direct', { durable: true });
    await channel.assertExchange(BROKER.DEAD_LETTER_EXCHANGE, 'fanout', { durable: true });

    await channel.assertQueue(BROKER.WAITER_CALLS_DLQ, { durable: true });
    await channel.bindQueue(BROKER.WAITER_CALLS_DLQ, BROKER.DEAD_LETTER_EXCHANGE, '');

    await channel.assertQueue(BROKER.WAITER_CALLS_QUEUE, {
      durable: true,
      arguments: { 'x-dead-letter-exchange': BROKER.DEAD_LETTER_EXCHANGE },
    });
    await channel.bindQueue(BROKER.WAITER_CALLS_QUEUE, BROKER.EXCHANGE, BROKER.WAITER_CALL_CREATED_KEY);
  }

  private handleDisconnect(): void {
    const wasConnected = this.connection !== null;
    if (this.consumeChannel) this.waiterCallConsumer.forgetChannel(this.consumeChannel);
    this.connection = null;
    this.publishChannel = null;
    this.consumeChannel = null;

    if (this.stopping) return;
    if (wasConnected) console.warn('[RabbitMQ] Соединение потеряно, переподключение...');
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.stopping) return;
    const delay = Math.min(1000 * 2 ** this.reconnectAttempt, MAX_RECONNECT_DELAY_MS);
    this.reconnectAttempt += 1;

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      try {
        await this.connect();
      } catch (error) {
        console.warn(`[RabbitMQ] Переподключение не удалось: ${(error as Error).message}`);
        this.scheduleReconnect();
      }
    }, delay);
  }

  /**
   * Публикует вызов официанта и ждёт подтверждения брокера (publisher confirm):
   * resolve означает, что persistent-сообщение принято в durable-очередь.
   */
  async publishWaiterCall(message: WaiterCallMessage): Promise<void> {
    const channel = this.publishChannel;
    if (!channel) throw new Error('RabbitMQ недоступен');

    const confirmed = new Promise<void>((resolve, reject) => {
      channel.publish(
        BROKER.EXCHANGE,
        BROKER.WAITER_CALL_CREATED_KEY,
        Buffer.from(JSON.stringify(message)),
        {
          persistent: true,
          contentType: 'application/json',
          messageId: message.event_id,
          type: message.type,
          timestamp: Math.floor(Date.parse(message.timestamp) / 1000),
        },
        (err) => (err ? reject(err) : resolve()),
      );
    });

    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Нет подтверждения от RabbitMQ')), PUBLISH_TIMEOUT_MS);
    });

    try {
      await Promise.race([confirmed, timeout]);
    } finally {
      clearTimeout(timer);
    }
    console.log(`[RabbitMQ] Опубликован ${message.type} event_id=${message.event_id} table_id=${message.table_id}`);
  }

  /** Подтверждение обработки вызова официантом → ack сообщения в RabbitMQ. */
  acknowledgeWaiterCall(eventId: string): boolean {
    return this.waiterCallConsumer.acknowledge(eventId);
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    const connection = this.connection;
    this.connection = null;
    this.publishChannel = null;
    this.consumeChannel = null;
    await connection?.close().catch(() => undefined);
  }
}

export const rabbitMQService = new RabbitMQService();
