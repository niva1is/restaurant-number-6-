import { z } from 'zod';

/**
 * Формат сообщения WaiterCall в RabbitMQ (exchange restaurant.events → очередь waiter_calls).
 *
 * {
 *   "event_id":     "8d7c1d0e-...",          // UUID = waiter_calls.id; ключ идемпотентности
 *   "type":         "WAITER_CALL",
 *   "table_id":     3,
 *   "table_number": "3",
 *   "timestamp":    "2026-10-07T12:00:00.000Z" // ISO 8601, момент вызова
 * }
 *
 * AMQP-свойства: persistent, content_type=application/json, message_id=event_id, type=WAITER_CALL.
 */
export const WAITER_CALL_TYPE = 'WAITER_CALL' as const;

export const waiterCallMessageSchema = z.object({
  event_id: z.string().uuid(),
  type: z.literal(WAITER_CALL_TYPE),
  table_id: z.number().int().positive(),
  table_number: z.string(),
  timestamp: z.string().datetime(),
});

export type WaiterCallMessage = z.infer<typeof waiterCallMessageSchema>;

export const buildWaiterCallMessage = (call: {
  id: string;
  tableId: number;
  tableNumber: string;
  createdAt: Date;
}): WaiterCallMessage => ({
  event_id: call.id,
  type: WAITER_CALL_TYPE,
  table_id: call.tableId,
  table_number: call.tableNumber,
  timestamp: call.createdAt.toISOString(),
});

/** Разбор тела сообщения; null — сообщение повреждено и отправляется в DLQ. */
export const parseWaiterCallMessage = (content: Buffer): WaiterCallMessage | null => {
  try {
    const parsed = waiterCallMessageSchema.safeParse(JSON.parse(content.toString('utf8')));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
};
