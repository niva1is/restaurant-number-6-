import { describe, expect, it } from 'vitest';
import { OrderStatus, UserRole } from '@prisma/client';
import {
  assertTransition,
  availableTransitions,
  checkTransition,
  ORDER_TRANSITIONS,
} from '../../src/modules/orders/order.stateMachine';
import { ApiError } from '../../src/utils/ApiError';

const { ACCEPTED, COOKING, READY, SERVED, PAID, CANCELLED } = OrderStatus;
const { ADMIN, COOK, WAITER } = UserRole;

const catchApiError = (fn: () => void): ApiError => {
  try {
    fn();
  } catch (error) {
    if (error instanceof ApiError) return error;
    throw error;
  }
  throw new Error('Ожидалась ApiError');
};

describe('State machine заказа (BE-07, BE-08)', () => {
  it.each([
    [ACCEPTED, COOKING, COOK],
    [COOKING, READY, COOK],
    [READY, SERVED, WAITER],
    [SERVED, PAID, ADMIN],
  ])('основной путь: %s → %s разрешён роли %s', (from, to, role) => {
    expect(checkTransition(from, to, role)).toEqual({ ok: true });
    expect(() => assertTransition(from, to, role)).not.toThrow();
  });

  it.each([
    [ACCEPTED, PAID],
    [ACCEPTED, READY],
    [COOKING, SERVED],
    [READY, COOKING],
    [SERVED, READY],
    [ACCEPTED, ACCEPTED],
  ])('несуществующий переход %s → %s отклоняется с 400 для любой роли', (from, to) => {
    for (const role of [ADMIN, COOK, WAITER]) {
      const error = catchApiError(() => assertTransition(from, to, role));
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('INVALID_STATUS_TRANSITION');
    }
  });

  it.each([
    [ACCEPTED, COOKING, WAITER],
    [ACCEPTED, COOKING, ADMIN],
    [COOKING, READY, WAITER],
    [READY, SERVED, COOK],
    [SERVED, PAID, WAITER],
    [SERVED, PAID, COOK],
  ])('чужая роль: %s → %s запрещён роли %s (403)', (from, to, role) => {
    const error = catchApiError(() => assertTransition(from, to, role));
    expect(error.statusCode).toBe(403);
    expect(error.code).toBe('TRANSITION_FORBIDDEN_FOR_ROLE');
  });

  it('из конечных статусов PAID и CANCELLED переходов нет', () => {
    for (const final of [PAID, CANCELLED]) {
      expect(ORDER_TRANSITIONS[final]).toEqual({});
      for (const to of Object.values(OrderStatus)) {
        expect(checkTransition(final, to, ADMIN).ok).toBe(false);
      }
    }
  });

  it('CANCELLED: повар — только до начала готовки, администратор — до оплаты', () => {
    expect(checkTransition(ACCEPTED, CANCELLED, COOK).ok).toBe(true);
    expect(checkTransition(COOKING, CANCELLED, COOK).ok).toBe(false);
    for (const from of [ACCEPTED, COOKING, READY, SERVED]) {
      expect(checkTransition(from, CANCELLED, ADMIN).ok).toBe(true);
    }
    expect(checkTransition(READY, CANCELLED, WAITER).ok).toBe(false);
  });

  it('availableTransitions возвращает кнопки для роли', () => {
    expect(availableTransitions(ACCEPTED, COOK)).toEqual([COOKING, CANCELLED]);
    expect(availableTransitions(READY, WAITER)).toEqual([SERVED]);
    expect(availableTransitions(READY, COOK)).toEqual([]);
    expect(availableTransitions(SERVED, ADMIN)).toEqual([PAID, CANCELLED]);
  });
});
