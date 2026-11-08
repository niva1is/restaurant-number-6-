import { Prisma } from '@prisma/client';
import { ORDER_LIMITS } from '../../constants/enums';
import { ERRORS } from '../../constants/errorMessages';
import { ApiError } from '../../utils/ApiError';
import { MoneyInput, toDecimal } from '../../utils/money';

export interface OrderItemInput {
  dishId: number;
  quantity: number;
}

/** Данные блюда, которые сервер берёт из БД (а не из запроса клиента). */
export interface DishForPricing {
  id: number;
  name: string;
  price: MoneyInput;
  isAvailable: boolean;
}

export interface PricedLine {
  dishId: number;
  dishName: string;
  quantity: number;
  /** Снимок цены за единицу на момент заказа (BE-06). */
  orderedPrice: Prisma.Decimal;
  lineTotal: Prisma.Decimal;
}

/** Объединяет повторяющиеся позиции корзины: [{1,x2},{1,x1}] → [{1,x3}]. */
export const mergeOrderItems = (items: OrderItemInput[]): OrderItemInput[] => {
  const merged = new Map<number, number>();
  for (const { dishId, quantity } of items) {
    merged.set(dishId, (merged.get(dishId) ?? 0) + quantity);
  }

  const result = [...merged].map(([dishId, quantity]) => ({ dishId, quantity }));
  const tooMany = result.find((i) => i.quantity > ORDER_LIMITS.MAX_QUANTITY);
  if (tooMany) {
    throw new ApiError(400, ERRORS.VALIDATION_ERROR, {
      message: `Не более ${ORDER_LIMITS.MAX_QUANTITY} порций одного блюда в заказе`,
      details: { dishId: tooMany.dishId, quantity: tooMany.quantity },
    });
  }
  return result;
};

/**
 * Серверный расчёт заказа (BE-05): цена и доступность берутся только из БД.
 * Цены, присланные клиентом, игнорируются. Блюда из стоп-листа отклоняются с ошибкой 400 (BE-02).
 */
export const priceOrder = (
  items: OrderItemInput[],
  dishes: DishForPricing[],
): { lines: PricedLine[]; total: Prisma.Decimal } => {
  const byId = new Map(dishes.map((d) => [d.id, d]));

  const missing = items.filter((i) => !byId.has(i.dishId)).map((i) => i.dishId);
  if (missing.length > 0) {
    throw new ApiError(400, ERRORS.DISH_NOT_FOUND, {
      message: `${ERRORS.DISH_NOT_FOUND.message}: id ${missing.join(', ')}`,
      details: { dishIds: missing },
    });
  }

  const unavailable = items.map((i) => byId.get(i.dishId)!).filter((d) => !d.isAvailable);
  if (unavailable.length > 0) {
    throw new ApiError(400, ERRORS.DISH_IN_STOP_LIST, {
      message: `${ERRORS.DISH_IN_STOP_LIST.message}: ${unavailable.map((d) => d.name).join(', ')}`,
      details: { dishes: unavailable.map((d) => ({ id: d.id, name: d.name })) },
    });
  }

  const lines = items.map(({ dishId, quantity }) => {
    const dish = byId.get(dishId)!;
    const orderedPrice = toDecimal(dish.price);
    return { dishId, dishName: dish.name, quantity, orderedPrice, lineTotal: orderedPrice.mul(quantity) };
  });

  const total = lines.reduce((sum, line) => sum.add(line.lineTotal), new Prisma.Decimal(0));
  return { lines, total };
};
