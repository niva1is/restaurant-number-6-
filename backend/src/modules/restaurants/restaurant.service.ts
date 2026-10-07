import { Prisma } from '@prisma/client';
import { ERRORS } from '../../constants/errorMessages';
import { prisma } from '../../lib/prisma';
import { ApiError } from '../../utils/ApiError';

const DEFAULT_RESTAURANT_NAME = 'QR Restaurant';

/**
 * Определяет ресторан для новых столов и категорий.
 * Явно переданный id проверяется; без него используется ресторан по умолчанию
 * (на чистой БД он создаётся автоматически — сценарий не требует ручной правки данных, NFR-01).
 */
export const resolveRestaurantId = async (
  restaurantId?: number,
  db: Prisma.TransactionClient = prisma,
): Promise<number> => {
  if (restaurantId !== undefined) {
    const exists = await db.restaurant.findUnique({ where: { id: restaurantId }, select: { id: true } });
    if (!exists) throw new ApiError(404, ERRORS.RESTAURANT_NOT_FOUND);
    return exists.id;
  }

  const first = await db.restaurant.findFirst({ orderBy: { id: 'asc' }, select: { id: true } });
  if (first) return first.id;

  const created = await db.restaurant.upsert({
    where: { name: DEFAULT_RESTAURANT_NAME },
    update: {},
    create: { name: DEFAULT_RESTAURANT_NAME },
    select: { id: true },
  });
  return created.id;
};
