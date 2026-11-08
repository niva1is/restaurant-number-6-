import type { ConsumeMessage } from 'amqplib';
import { WaiterCallStatus } from '@prisma/client';
import { parseWaiterCallMessage } from './waiterCall.message';
import type { WaiterCallEventPayload } from './websocket.service';

/** Минимальный интерфейс канала: в тестах подменяется заглушкой. */
export interface AckChannel {
  ack(message: ConsumeMessage): void;
  nack(message: ConsumeMessage, allUpTo?: boolean, requeue?: boolean): void;
}

export interface WaiterCallConsumerDeps {
  /** Текущее состояние вызова в БД (источник истины). */
  findCall(eventId: string): Promise<{ status: WaiterCallStatus } | null>;
  /** Доставка в WebSocket-шлюз (панель официанта). */
  notify(payload: WaiterCallEventPayload): void;
  /** Пауза перед возвратом сообщения в очередь, если БД временно недоступна. */
  retryDelayMs?: number;
}

export type ConsumeOutcome = 'delivered' | 'duplicate' | 'stale' | 'invalid' | 'retry';

/**
 * Обработчик очереди waiter_calls.
 *
 * Подтверждение обработки (ack): сообщение остаётся неподтверждённым, пока официант не примет вызов
 * (POST /notifications/call-waiter/:eventId/resolve → acknowledge). Если бэкенд перезапустится раньше,
 * RabbitMQ доставит сообщение повторно и вызов снова появится на панели.
 *
 * Идемпотентность (повтор не создаёт дубль активного вызова):
 *  - вызов уже RESOLVED или отсутствует в БД → ack, на панель не отправляется;
 *  - этот event_id уже удерживается (повторная публикация) → ack копии, на панель не отправляется;
 *  - после переподключения то же сообщение отправляется на панель с тем же eventId и redelivered=true,
 *    фронтенд обновляет существующую карточку по eventId.
 * Новых записей WaiterCall consumer не создаёт никогда: факт вызова сохраняется до публикации.
 */
export class WaiterCallConsumer {
  private readonly held = new Map<string, { message: ConsumeMessage; channel: AckChannel }>();

  constructor(private readonly deps: WaiterCallConsumerDeps) {}

  async handle(channel: AckChannel, message: ConsumeMessage): Promise<ConsumeOutcome> {
    const payload = parseWaiterCallMessage(message.content);
    if (!payload) {
      // Повреждённое сообщение не возвращаем в очередь (иначе бесконечный цикл) — уходит в DLQ.
      channel.nack(message, false, false);
      return 'invalid';
    }

    let call: { status: WaiterCallStatus } | null;
    try {
      call = await this.deps.findCall(payload.event_id);
    } catch {
      await new Promise((resolve) => setTimeout(resolve, this.deps.retryDelayMs ?? 1000));
      channel.nack(message, false, true);
      return 'retry';
    }

    if (!call || call.status === WaiterCallStatus.RESOLVED) {
      channel.ack(message);
      return 'stale';
    }

    if (this.held.has(payload.event_id)) {
      channel.ack(message);
      return 'duplicate';
    }

    this.held.set(payload.event_id, { message, channel });
    this.deps.notify({
      eventId: payload.event_id,
      type: payload.type,
      tableId: payload.table_id,
      tableNumber: payload.table_number,
      timestamp: payload.timestamp,
      redelivered: message.fields.redelivered,
    });
    return 'delivered';
  }

  /** Официант принял вызов: подтверждаем сообщение в RabbitMQ. false — сообщение не удерживается этим процессом. */
  acknowledge(eventId: string): boolean {
    const entry = this.held.get(eventId);
    if (!entry) return false;
    this.held.delete(eventId);
    try {
      entry.channel.ack(entry.message);
    } catch {
      // Канал уже закрыт: брокер повторно доставит сообщение, оно будет подтверждено как stale.
    }
    return true;
  }

  /** Канал закрылся: его delivery tag больше недействительны, брокер доставит сообщения заново. */
  forgetChannel(channel: AckChannel): void {
    for (const [eventId, entry] of this.held) {
      if (entry.channel === channel) this.held.delete(eventId);
    }
  }

  get pendingCount(): number {
    return this.held.size;
  }
}
