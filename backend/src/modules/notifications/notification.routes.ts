import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { authenticate, authorize, requireTableToken } from '../../middlewares/auth.middleware';
import { guestRateLimiter } from '../../middlewares/rateLimiter.middleware';
import * as notificationController from './notification.controller';

const router = Router();
const waiters = [authenticate, authorize(UserRole.WAITER, UserRole.ADMIN)];

/**
 * POST /api/v1/notifications/call-waiter — гость вызывает официанта (X-Table-Token).
 * Не чаще 1 раза в 30 с со стола: иначе 429 + Retry-After. Событие уходит в RabbitMQ (очередь waiter_calls).
 */
router.post('/call-waiter', guestRateLimiter, requireTableToken, notificationController.callWaiter);

/** POST /api/v1/notifications/call-waiter/:eventId/resolve — официант принял вызов: RESOLVED + ack в RabbitMQ. WAITER, ADMIN. */
router.post('/call-waiter/:eventId/resolve', ...waiters, notificationController.resolveWaiterCall);

/** GET /api/v1/notifications/calls/active — активные вызовы (восстановление панели официанта). WAITER, ADMIN. */
router.get('/calls/active', ...waiters, notificationController.getActiveWaiterCalls);

export default router;
