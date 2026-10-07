import { OrderStatus, UserRole } from '@prisma/client';

// Источник истины для перечислений — Prisma-схема; здесь только реэкспорт и константы приложения.
export { EventActor, OrderStatus, UserRole, WaiterCallStatus } from '@prisma/client';

/** Статусы, в которых заказ ещё «в работе» и виден кухне/официанту. */
export const ACTIVE_ORDER_STATUSES: OrderStatus[] = [
  OrderStatus.ACCEPTED,
  OrderStatus.COOKING,
  OrderStatus.READY,
  OrderStatus.SERVED,
];

/** Конечные статусы: из них переходов нет. */
export const FINAL_ORDER_STATUSES: OrderStatus[] = [OrderStatus.PAID, OrderStatus.CANCELLED];

export const STAFF_ROLES: UserRole[] = [UserRole.ADMIN, UserRole.COOK, UserRole.WAITER];

/** События, которые сервер отправляет клиентам по WebSocket (Socket.io). */
export enum WSEvent {
  ORDER_CREATED = 'ORDER_CREATED',
  ORDER_STATUS_CHANGED = 'ORDER_STATUS_CHANGED',
  NEW_WAITER_CALL = 'NEW_WAITER_CALL',
  WAITER_CALL_RESOLVED = 'WAITER_CALL_RESOLVED',
  STOP_LIST_CHANGED = 'STOP_LIST_CHANGED',
}

/** Топология RabbitMQ. */
export const BROKER = {
  EXCHANGE: 'restaurant.events',
  DEAD_LETTER_EXCHANGE: 'restaurant.events.dlx',
  WAITER_CALLS_QUEUE: 'waiter_calls',
  WAITER_CALLS_DLQ: 'waiter_calls.dlq',
  WAITER_CALL_CREATED_KEY: 'waiter_call.created',
} as const;

/** Ограничения на размер заказа (защита от некорректных и злонамеренных запросов). */
export const ORDER_LIMITS = {
  MAX_ITEMS: 50,
  MAX_QUANTITY: 50,
} as const;
