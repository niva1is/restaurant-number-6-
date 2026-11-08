import { randomUUID } from 'crypto';
import QRCode from 'qrcode';
import { z } from 'zod';
import { Table } from '@prisma/client';
import { config } from '../../config/env';
import { ERRORS } from '../../constants/errorMessages';
import { prisma } from '../../lib/prisma';
import { ApiError } from '../../utils/ApiError';
import { resolveRestaurantId } from '../restaurants/restaurant.service';
import { CreateTableInput } from './table.validator';

/**
 * Токен стола — UUID v4 из криптостойкого генератора (crypto.randomUUID), 122 случайных бита.
 * Ссылку в QR-коде нельзя угадать перебором, в отличие от последовательного id стола (BE-03).
 */
const generateTableToken = (): string => randomUUID();

/** Ссылка, которую кодирует QR: фронтенд сохраняет токен из URL в localStorage. */
export const buildTableUrl = (tableToken: string): string => `${config.publicAppUrl}/table/${tableToken}`;

const toTableDto = (table: Table) => ({
  id: table.id,
  number: table.number,
  restaurantId: table.restaurantId,
  tableToken: table.tableToken,
  qrUrl: buildTableUrl(table.tableToken),
  createdAt: table.createdAt,
});

const findTableOr404 = async (id: number) => {
  const table = await prisma.table.findUnique({ where: { id } });
  if (!table) throw new ApiError(404, ERRORS.TABLE_NOT_FOUND);
  return table;
};

export const listTables = async () => {
  const tables = await prisma.table.findMany({ orderBy: [{ restaurantId: 'asc' }, { id: 'asc' }] });
  return tables.map(toTableDto);
};

export const createTable = async (input: CreateTableInput) => {
  const restaurantId = await resolveRestaurantId(input.restaurantId);
  const table = await prisma.table.create({
    data: { number: input.number, restaurantId, tableToken: generateTableToken() },
  });
  return toTableDto(table);
};

export const updateTable = async (id: number, number: string) => {
  await findTableOr404(id);
  return toTableDto(await prisma.table.update({ where: { id }, data: { number } }));
};

export const deleteTable = async (id: number) => {
  await findTableOr404(id);
  const orders = await prisma.order.count({ where: { tableId: id } });
  if (orders > 0) throw new ApiError(409, ERRORS.TABLE_HAS_ORDERS, { details: { orderCount: orders } });
  await prisma.table.delete({ where: { id } });
};

/** Перевыпуск токена: старый QR-код перестаёт работать (например, если ссылку унесли из ресторана). */
export const regenerateToken = async (id: number) => {
  await findTableOr404(id);
  return toTableDto(await prisma.table.update({ where: { id }, data: { tableToken: generateTableToken() } }));
};

export type QrFormat = 'json' | 'svg' | 'png';

export const getQrCode = async (id: number, format: QrFormat) => {
  const table = await findTableOr404(id);
  const url = buildTableUrl(table.tableToken);
  const options = { errorCorrectionLevel: 'M' as const, margin: 2, width: 512 };

  if (format === 'svg') {
    return { type: 'image/svg+xml', body: await QRCode.toString(url, { ...options, type: 'svg' }) } as const;
  }
  if (format === 'png') {
    return { type: 'image/png', body: await QRCode.toBuffer(url, options) } as const;
  }
  return {
    type: 'json',
    body: { tableId: table.id, number: table.number, url, qrDataUrl: await QRCode.toDataURL(url, options) },
  } as const;
};

/**
 * Проверка QR-токена гостем (BE-04): возвращает контекст стола для гостевой сессии.
 * Неверный формат и несуществующий токен дают одинаковый ответ — ничего не подсказываем перебору.
 */
export const checkTableToken = async (token: string) => {
  const parsed = z.string().uuid().safeParse(token);
  const table = parsed.success
    ? await prisma.table.findUnique({ where: { tableToken: parsed.data }, include: { restaurant: true } })
    : null;

  if (!table) throw new ApiError(404, ERRORS.INVALID_TABLE_TOKEN);

  return {
    valid: true,
    table: { id: table.id, number: table.number },
    restaurant: { id: table.restaurant.id, name: table.restaurant.name },
  };
};
