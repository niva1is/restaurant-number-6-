import { OrderStatus, UserRole } from '@prisma/client';
import { ERRORS } from '../../constants/errorMessages';
import { ApiError } from '../../utils/ApiError';

const { ACCEPTED, COOKING, READY, SERVED, PAID, CANCELLED } = OrderStatus;
const { ADMIN, COOK, WAITER } = UserRole;

/**
 * State machine заказа: допустимые переходы и роли, которым они разрешены.
 *
 *   ACCEPTED ──COOK──▶ COOKING ──COOK──▶ READY ──WAITER──▶ SERVED ──ADMIN──▶ PAID
 *      │                  │                 │                 │
 *      └──COOK/ADMIN──────┴──ADMIN──────────┴──ADMIN──────────┴──▶ CANCELLED
 *
 * PAID и CANCELLED — конечные состояния. Всё, чего нет в таблице, сервер отклоняет (BE-07, BE-08).
 */
export const ORDER_TRANSITIONS: Readonly<Record<OrderStatus, Partial<Record<OrderStatus, readonly UserRole[]>>>> = {
  [ACCEPTED]: { [COOKING]: [COOK], [CANCELLED]: [COOK, ADMIN] },
  [COOKING]: { [READY]: [COOK], [CANCELLED]: [ADMIN] },
  [READY]: { [SERVED]: [WAITER], [CANCELLED]: [ADMIN] },
  [SERVED]: { [PAID]: [ADMIN], [CANCELLED]: [ADMIN] },
  [PAID]: {},
  [CANCELLED]: {},
};

export type TransitionCheck =
  | { ok: true }
  | { ok: false; reason: 'INVALID_TRANSITION'; allowedTargets: OrderStatus[] }
  | { ok: false; reason: 'ROLE_FORBIDDEN'; allowedRoles: UserRole[] };

/** Проверка перехода без побочных эффектов. */
export const checkTransition = (from: OrderStatus, to: OrderStatus, role: UserRole): TransitionCheck => {
  const targets = ORDER_TRANSITIONS[from];
  const allowedRoles = targets[to];

  if (!allowedRoles) {
    return { ok: false, reason: 'INVALID_TRANSITION', allowedTargets: Object.keys(targets) as OrderStatus[] };
  }
  if (!allowedRoles.includes(role)) {
    return { ok: false, reason: 'ROLE_FORBIDDEN', allowedRoles: [...allowedRoles] };
  }
  return { ok: true };
};

/**
 * Бросает ошибку при недопустимом переходе:
 *   400 INVALID_STATUS_TRANSITION     — такого перехода нет в state machine (например, ACCEPTED → PAID);
 *   403 TRANSITION_FORBIDDEN_FOR_ROLE — переход существует, но не для этой роли (например, официант ACCEPTED → COOKING).
 */
export const assertTransition = (from: OrderStatus, to: OrderStatus, role: UserRole): void => {
  const check = checkTransition(from, to, role);
  if (check.ok) return;

  if (check.reason === 'INVALID_TRANSITION') {
    throw new ApiError(400, ERRORS.INVALID_STATUS_TRANSITION, {
      message: `${ERRORS.INVALID_STATUS_TRANSITION.message}: ${from} → ${to}`,
      details: { from, to, allowedTargets: check.allowedTargets },
    });
  }
  throw new ApiError(403, ERRORS.TRANSITION_FORBIDDEN_FOR_ROLE, {
    message: `${ERRORS.TRANSITION_FORBIDDEN_FOR_ROLE.message}: ${from} → ${to}`,
    details: { from, to, role, allowedRoles: check.allowedRoles },
  });
};

/** Какие статусы роль может выставить из текущего — для кнопок на кухне и у официанта. */
export const availableTransitions = (from: OrderStatus, role: UserRole): OrderStatus[] =>
  (Object.entries(ORDER_TRANSITIONS[from]) as [OrderStatus, readonly UserRole[]][])
    .filter(([, roles]) => roles.includes(role))
    .map(([to]) => to);
