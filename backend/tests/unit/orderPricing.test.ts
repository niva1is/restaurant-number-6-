import { describe, expect, it } from 'vitest';
import { mergeOrderItems, priceOrder } from '../../src/modules/orders/order.pricing';
import { ApiError } from '../../src/utils/ApiError';

const dishes = [
  { id: 1, name: 'Маргарита', price: '590.00', isAvailable: true },
  { id: 2, name: 'Капучино', price: '220.10', isAvailable: true },
  { id: 3, name: 'Тирамису', price: '350.00', isAvailable: false },
  { id: 4, name: 'Морс', price: '0.10', isAvailable: true },
  { id: 5, name: 'Сироп', price: '0.20', isAvailable: true },
];

describe('Расчёт заказа на сервере (BE-05, BE-06)', () => {
  it('считает сумму по ценам из БД и фиксирует снимок цены каждой позиции', () => {
    const { lines, total } = priceOrder(
      [
        { dishId: 1, quantity: 2 },
        { dishId: 2, quantity: 3 },
      ],
      dishes,
    );

    expect(lines.map((l) => [l.dishName, l.orderedPrice.toFixed(2), l.lineTotal.toFixed(2)])).toEqual([
      ['Маргарита', '590.00', '1180.00'],
      ['Капучино', '220.10', '660.30'],
    ]);
    expect(total.toFixed(2)).toBe('1840.30');
  });

  it('не накапливает ошибку округления float (0.1 + 0.2)', () => {
    const { total } = priceOrder(
      [
        { dishId: 4, quantity: 1 },
        { dishId: 5, quantity: 1 },
      ],
      dishes,
    );
    expect(total.toFixed(2)).toBe('0.30');
    expect(total.toNumber()).toBe(0.3);
  });

  it('блюдо из стоп-листа нельзя включить в заказ — 400 DISH_IN_STOP_LIST с названием (BE-02)', () => {
    let error: unknown;
    try {
      priceOrder(
        [
          { dishId: 1, quantity: 1 },
          { dishId: 3, quantity: 1 },
        ],
        dishes,
      );
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).statusCode).toBe(400);
    expect((error as ApiError).code).toBe('DISH_IN_STOP_LIST');
    expect((error as ApiError).message).toContain('Тирамису');
  });

  it('несуществующее блюдо отклоняется — 400 DISH_NOT_FOUND', () => {
    expect(() => priceOrder([{ dishId: 999, quantity: 1 }], dishes)).toThrowError(/Блюдо не найдено/);
  });

  it('объединяет повторяющиеся позиции корзины', () => {
    expect(
      mergeOrderItems([
        { dishId: 1, quantity: 2 },
        { dishId: 2, quantity: 1 },
        { dishId: 1, quantity: 3 },
      ]),
    ).toEqual([
      { dishId: 1, quantity: 5 },
      { dishId: 2, quantity: 1 },
    ]);
  });

  it('ограничивает количество одного блюда после объединения позиций', () => {
    expect(() =>
      mergeOrderItems([
        { dishId: 1, quantity: 30 },
        { dishId: 1, quantity: 30 },
      ]),
    ).toThrowError(ApiError);
  });
});
