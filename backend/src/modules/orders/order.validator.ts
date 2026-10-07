import { z } from 'zod';
import { OrderStatus } from '@prisma/client';
import { ACTIVE_ORDER_STATUSES, ORDER_LIMITS } from '../../constants/enums';

const orderItemSchema = z.object({
  dishId: z.number({ required_error: 'dishId обязателен' }).int().positive(),
  quantity: z
    .number({ required_error: 'quantity обязателен' })
    .int('Количество должно быть целым')
    .min(1, 'Количество должно быть не меньше 1')
    .max(ORDER_LIMITS.MAX_QUANTITY, `Не более ${ORDER_LIMITS.MAX_QUANTITY} порций`),
});

const itemsSchema = z
  .array(orderItemSchema, { required_error: 'items обязателен' })
  .min(1, 'Корзина пуста')
  .max(ORDER_LIMITS.MAX_ITEMS, `Не более ${ORDER_LIMITS.MAX_ITEMS} позиций в заказе`);

/** Предварительный расчёт корзины (без создания заказа). */
export const quoteOrderSchema = z.object({ items: itemsSchema });

export const createOrderSchema = z.object({
  items: itemsSchema,
  comment: z.string().trim().max(500).optional(),
  /**
   * Сумма, которую видел гость в корзине. Если сервер насчитал другую (цена изменилась),
   * заказ не создаётся — ответ 409 PRICE_CHANGED с актуальной суммой (FE-02: итог подтверждает сервер).
   */
  expectedTotal: z.number().nonnegative().optional(),
});

export const changeStatusSchema = z.object({
  status: z.nativeEnum(OrderStatus, { errorMap: () => ({ message: `Допустимые статусы: ${Object.values(OrderStatus).join(', ')}` }) }),
  reason: z.string().trim().max(500).optional(),
});

/** ?status=ACCEPTED,COOKING — фильтр витрины кухни/официанта. */
export const activeOrdersQuerySchema = z.object({
  status: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(',').map((s) => s.trim().toUpperCase()) : undefined))
    .pipe(z.array(z.enum(ACTIVE_ORDER_STATUSES as [OrderStatus, ...OrderStatus[]])).optional()),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
