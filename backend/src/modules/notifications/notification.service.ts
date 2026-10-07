import { Prisma, WaiterCallStatus } from '@prisma/client';
import { config } from '../../config/env';
import { ERRORS } from '../../constants/errorMessages';
import { StaffPrincipal } from '../../lib/jwt';
import { prisma } from '../../lib/prisma';
import type { TableContext } from '../../types/context';
import { ApiError } from '../../utils/ApiError';
import { rabbitMQService } from './rabbitmq.service';
import { buildWaiterCallMessage, WAITER_CALL_TYPE } from './waiterCall.message';
import { websocketService } from './websocket.service';

const callInclude = {
  table: { select: { number: true } },
  resolvedBy: { select: { id: true, username: true } },
} satisfies Prisma.WaiterCallInclude;

type CallWithTable = Prisma.WaiterCallGetPayload<{ include: typeof callInclude }>;

const toCallDto = (call: CallWithTable) => ({
  eventId: call.id,
  type: WAITER_CALL_TYPE,
  tableId: call.tableId,
  tableNumber: call.table.number,
  status: call.status,
  createdAt: call.createdAt,
  publishedAt: call.publishedAt,
  resolvedAt: call.resolvedAt,
  resolvedBy: call.resolvedBy,
});

/**
 * Сколько секунд осталось до следующего разрешённого вызова (BE-10). 0 — вызывать можно.
 * Считается от последнего вызова стола, сохранённого в БД: ограничение переживает перезапуск
 * сервера и действует для всех гостей стола, с какого бы устройства они ни нажимали кнопку.
 */
export const computeRetryAfterSeconds = (lastCallAt: Date | null, now: Date, cooldownMs: number): number => {
  if (!lastCallAt) return 0;
  const remainingMs = lastCallAt.getTime() + cooldownMs - now.getTime();
  return remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0;
};

/** Публикует вызов в RabbitMQ и фиксирует published_at. При недоступности брокера — запасная доставка. */
const publishCall = async (call: CallWithTable): Promise<'broker' | 'fallback'> => {
  try {
    await rabbitMQService.publishWaiterCall(
      buildWaiterCallMessage({ id: call.id, tableId: call.tableId, tableNumber: call.table.number, createdAt: call.createdAt }),
    );
    await prisma.waiterCall.update({ where: { id: call.id }, data: { publishedAt: new Date() } });
    return 'broker';
  } catch (error) {
    // Вызов уже сохранён в БД (published_at = NULL): после восстановления брокера он будет опубликован
    // повторно (republishPendingCalls), а пока официант увидит его напрямую через WebSocket.
    // Тот же eventId — фронтенд не покажет дубль.
    console.warn(`[WaiterCall] Брокер недоступен, запасная доставка через WebSocket: ${(error as Error).message}`);
    websocketService.newWaiterCall({
      eventId: call.id,
      type: WAITER_CALL_TYPE,
      tableId: call.tableId,
      tableNumber: call.table.number,
      timestamp: call.createdAt.toISOString(),
      redelivered: false,
    });
    return 'fallback';
  }
};

/**
 * Гость вызывает официанта (BE-09, BE-10).
 *  1. Rate limit: не чаще одного вызова в WAITER_CALL_COOLDOWN_SECONDS с одного стола → 429 + Retry-After.
 *  2. Если у стола уже есть активный (PENDING) вызов — возвращаем его, новый не создаём.
 *  3. Сохраняем WaiterCall (PENDING) — факт вызова хранится на сервере.
 *  4. Публикуем событие в RabbitMQ; consumer доставляет его на панель официанта через WebSocket.
 */
export const callWaiter = async (table: TableContext) => {
  const now = new Date();
  const lastCall = await prisma.waiterCall.findFirst({
    where: { tableId: table.id },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });

  const retryAfter = computeRetryAfterSeconds(lastCall?.createdAt ?? null, now, config.waiterCallCooldownMs);
  if (retryAfter > 0) {
    throw new ApiError(429, ERRORS.WAITER_CALL_RATE_LIMITED, {
      message: `${ERRORS.WAITER_CALL_RATE_LIMITED.message}. Повторите через ${retryAfter} с`,
      retryAfterSeconds: retryAfter,
      details: { retryAfterSeconds: retryAfter },
    });
  }

  const existing = await prisma.waiterCall.findUnique({ where: { activeTableId: table.id }, include: callInclude });
  if (existing) return { duplicate: true, call: toCallDto(existing) };

  let call: CallWithTable;
  try {
    call = await prisma.waiterCall.create({
      data: { tableId: table.id, activeTableId: table.id, status: WaiterCallStatus.PENDING },
      include: callInclude,
    });
  } catch (error) {
    // Гонка двух одновременных запросов: UNIQUE(active_table_id) пропустил только один.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const winner = await prisma.waiterCall.findUnique({ where: { activeTableId: table.id }, include: callInclude });
      if (winner) return { duplicate: true, call: toCallDto(winner) };
    }
    throw error;
  }

  const delivery = await publishCall(call);
  return { duplicate: false, delivery, call: toCallDto(call) };
};

/**
 * Официант принимает вызов. Идемпотентно: повторное нажатие не меняет данные и не даёт ошибку.
 * Статус меняется условным UPDATE (только из PENDING), затем подтверждается сообщение в RabbitMQ (ack).
 */
export const resolveWaiterCall = async (eventId: string, user: StaffPrincipal) => {
  const resolvedAt = new Date();
  const updated = await prisma.waiterCall.updateMany({
    where: { id: eventId, status: WaiterCallStatus.PENDING },
    data: { status: WaiterCallStatus.RESOLVED, activeTableId: null, resolvedAt, resolvedById: user.id },
  });

  const call = await prisma.waiterCall.findUnique({ where: { id: eventId }, include: callInclude });
  if (!call) throw new ApiError(404, ERRORS.WAITER_CALL_NOT_FOUND);

  // ack делаем и при повторном запросе: сообщение могло остаться в очереди после сбоя.
  rabbitMQService.acknowledgeWaiterCall(eventId);

  const alreadyResolved = updated.count === 0;
  if (!alreadyResolved) {
    websocketService.waiterCallResolved({
      eventId,
      tableId: call.tableId,
      resolvedAt: resolvedAt.toISOString(),
      resolvedBy: { id: user.id, username: user.username },
    });
  }

  return { alreadyResolved, call: toCallDto(call) };
};

/**
 * Активные вызовы — восстановление панели официанта из серверного состояния (NFR-09):
 * запрашивается один раз при открытии или переподключении панели, дальше обновления приходят по WebSocket.
 */
export const getActiveWaiterCalls = async () => {
  const calls = await prisma.waiterCall.findMany({
    where: { status: WaiterCallStatus.PENDING },
    include: callInclude,
    orderBy: { createdAt: 'asc' },
  });
  return calls.map(toCallDto);
};

/** Outbox: при (пере)подключении к брокеру публикуем вызовы, которые не удалось опубликовать раньше. */
export const republishPendingCalls = async (): Promise<number> => {
  const unpublished = await prisma.waiterCall.findMany({
    where: { status: WaiterCallStatus.PENDING, publishedAt: null },
    include: callInclude,
    orderBy: { createdAt: 'asc' },
  });

  let published = 0;
  for (const call of unpublished) {
    if ((await publishCall(call)) === 'broker') published += 1;
  }
  if (unpublished.length > 0) {
    console.log(`[WaiterCall] Повторно опубликовано вызовов: ${published}/${unpublished.length}`);
  }
  return published;
};
