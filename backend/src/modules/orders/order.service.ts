import { EventActor, OrderStatus, Prisma, UserRole } from '@prisma/client';
import { ACTIVE_ORDER_STATUSES } from '../../constants/enums';
import { ERRORS } from '../../constants/errorMessages';
import { StaffPrincipal } from '../../lib/jwt';
import { prisma } from '../../lib/prisma';
import type { TableContext } from '../../types/context';
import { ApiError } from '../../utils/ApiError';
import { toDecimal, toMoney } from '../../utils/money';
import { websocketService } from '../notifications/websocket.service';
import { mergeOrderItems, OrderItemInput, priceOrder } from './order.pricing';
import { assertTransition, availableTransitions } from './order.stateMachine';
import { CreateOrderInput } from './order.validator';

/** Сколько гость видит завершённый (PAID/CANCELLED) заказ своего стола. */
const GUEST_FINISHED_ORDER_VISIBILITY_MS = 30 * 60 * 1000;

const orderInclude = {
  table: { select: { id: true, number: true } },
  items: { orderBy: { id: 'asc' } },
} satisfies Prisma.OrderInclude;

type OrderWithItems = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

/** DTO заказа. Для сотрудника добавляются доступные ему переходы статуса (кнопки на терминале). */
const toOrderDto = (order: OrderWithItems, viewerRole?: UserRole) => ({
  id: order.id,
  tableId: order.tableId,
  tableNumber: order.table.number,
  status: order.status,
  totalAmount: toMoney(order.totalAmount),
  comment: order.comment,
  createdAt: order.createdAt,
  updatedAt: order.updatedAt,
  /** Время ожидания с момента заказа — для кухонного терминала (FE-04). */
  waitingSeconds: Math.max(0, Math.floor((Date.now() - order.createdAt.getTime()) / 1000)),
  items: order.items.map((item) => ({
    id: item.id,
    dishId: item.dishId,
    dishName: item.dishName,
    quantity: item.quantity,
    orderedPrice: toMoney(item.orderedPrice),
    lineTotal: toMoney(toDecimal(item.orderedPrice).mul(item.quantity)),
  })),
  ...(viewerRole && { availableTransitions: availableTransitions(order.status, viewerRole) }),
});

export type OrderDto = ReturnType<typeof toOrderDto>;

/**
 * Загружает блюда для расчёта, только из ресторана этого стола.
 * Внутри транзакции строки блокируются FOR SHARE: если повар в этот момент ставит блюдо
 * в стоп-лист, одна из операций дождётся другой, и заказ не «проскочит» со снятым блюдом.
 */
const loadDishesForPricing = async (db: Prisma.TransactionClient, restaurantId: number, dishIds: number[], lock: boolean) => {
  if (lock && dishIds.length > 0) {
    await db.$queryRaw`SELECT id FROM dishes WHERE id IN (${Prisma.join(dishIds)}) FOR SHARE`;
  }
  return db.dish.findMany({
    where: { id: { in: dishIds }, category: { restaurantId } },
    select: { id: true, name: true, price: true, isAvailable: true },
  });
};

/** Предварительный расчёт корзины: сервер подтверждает позиции и итог (FE-02). */
export const quoteOrder = async (table: TableContext, items: OrderItemInput[]) => {
  const merged = mergeOrderItems(items);
  const dishes = await loadDishesForPricing(prisma, table.restaurantId, merged.map((i) => i.dishId), false);
  const { lines, total } = priceOrder(merged, dishes);

  return {
    items: lines.map((l) => ({
      dishId: l.dishId,
      dishName: l.dishName,
      quantity: l.quantity,
      price: toMoney(l.orderedPrice),
      lineTotal: toMoney(l.lineTotal),
    })),
    totalAmount: toMoney(total),
  };
};

/**
 * Создание заказа гостем (BE-05, BE-06).
 * Всё в одной транзакции: повторная проверка стоп-листа и цен, снимок цен в позиции,
 * статус ACCEPTED и первая запись аудита. При любой ошибке заказ не создаётся частично.
 */
export const createOrder = async (table: TableContext, input: CreateOrderInput): Promise<OrderDto> => {
  const merged = mergeOrderItems(input.items);

  const order = await prisma.$transaction(async (tx) => {
    const dishes = await loadDishesForPricing(tx, table.restaurantId, merged.map((i) => i.dishId), true);
    const { lines, total } = priceOrder(merged, dishes);

    if (input.expectedTotal !== undefined && !total.equals(toDecimal(input.expectedTotal))) {
      throw new ApiError(409, ERRORS.PRICE_CHANGED, {
        details: {
          expectedTotal: input.expectedTotal,
          actualTotal: toMoney(total),
          items: lines.map((l) => ({ dishId: l.dishId, dishName: l.dishName, price: toMoney(l.orderedPrice) })),
        },
      });
    }

    return tx.order.create({
      data: {
        tableId: table.id,
        status: OrderStatus.ACCEPTED,
        totalAmount: total,
        comment: input.comment || null,
        items: {
          create: lines.map((l) => ({
            dishId: l.dishId,
            dishName: l.dishName,
            quantity: l.quantity,
            orderedPrice: l.orderedPrice,
          })),
        },
        statusEvents: {
          create: { fromStatus: null, toStatus: OrderStatus.ACCEPTED, actor: EventActor.GUEST },
        },
      },
      include: orderInclude,
    });
  });

  const dto = toOrderDto(order);
  websocketService.orderCreated(dto);
  return dto;
};

/**
 * Смена статуса заказа сотрудником (BE-07, BE-08, BE-11).
 *
 * 1. State machine и роль проверяются на сервере (assertTransition).
 * 2. Оптимистическая блокировка: UPDATE ... WHERE status = <прочитанный статус>. Если два повара
 *    одновременно нажали кнопку, второй получит 409, а не «перепрыгнет» через статус.
 * 3. Запись аудита (кто, когда, откуда, куда) — в той же транзакции.
 */
export const changeOrderStatus = async (
  orderId: number,
  toStatus: OrderStatus,
  user: StaffPrincipal,
  reason?: string,
): Promise<OrderDto> => {
  const { order, fromStatus, timestamp } = await prisma.$transaction(async (tx) => {
    const current = await tx.order.findUnique({ where: { id: orderId }, select: { status: true } });
    if (!current) throw new ApiError(404, ERRORS.ORDER_NOT_FOUND);

    assertTransition(current.status, toStatus, user.role);

    const updated = await tx.order.updateMany({
      where: { id: orderId, status: current.status },
      data: { status: toStatus },
    });
    if (updated.count === 0) throw new ApiError(409, ERRORS.ORDER_STATUS_CONFLICT);

    const event = await tx.orderStatusEvent.create({
      data: {
        orderId,
        fromStatus: current.status,
        toStatus,
        actor: EventActor[user.role],
        userId: user.id,
        reason: reason || null,
      },
    });

    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: orderInclude });
    return { order, fromStatus: current.status, timestamp: event.timestamp };
  });

  websocketService.orderStatusChanged({
    orderId: order.id,
    tableId: order.tableId,
    tableNumber: order.table.number,
    fromStatus,
    toStatus,
    changedBy: { id: user.id, role: user.role },
    timestamp: timestamp.toISOString(),
  });

  return toOrderDto(order, user.role);
};

/** Витрина кухни и официанта: активные заказы, старые сверху (очередь). */
export const getActiveOrders = async (viewerRole: UserRole, statuses?: OrderStatus[]) => {
  const orders = await prisma.order.findMany({
    where: { status: { in: statuses?.length ? statuses : ACTIVE_ORDER_STATUSES } },
    include: orderInclude,
    orderBy: { createdAt: 'asc' },
  });
  return orders.map((o) => toOrderDto(o, viewerRole));
};

/** Заказ с полной историей статусов (аудит BE-11). */
export const getOrderById = async (orderId: number, viewerRole: UserRole) => {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      ...orderInclude,
      statusEvents: {
        orderBy: { timestamp: 'asc' },
        include: { user: { select: { id: true, username: true } } },
      },
    },
  });
  if (!order) throw new ApiError(404, ERRORS.ORDER_NOT_FOUND);

  return {
    ...toOrderDto(order, viewerRole),
    history: order.statusEvents.map((e) => ({
      fromStatus: e.fromStatus,
      toStatus: e.toStatus,
      actor: e.actor,
      user: e.user,
      reason: e.reason,
      timestamp: e.timestamp,
    })),
  };
};

/** Заказы стола для гостя: текущие + недавно завершённые, чтобы гость увидел PAID/CANCELLED (FE-03). */
export const getTableOrders = async (table: TableContext) => {
  const orders = await prisma.order.findMany({
    where: {
      tableId: table.id,
      OR: [
        { status: { in: ACTIVE_ORDER_STATUSES } },
        { updatedAt: { gte: new Date(Date.now() - GUEST_FINISHED_ORDER_VISIBILITY_MS) } },
      ],
    },
    include: orderInclude,
    orderBy: { createdAt: 'desc' },
  });
  return orders.map((o) => toOrderDto(o));
};
