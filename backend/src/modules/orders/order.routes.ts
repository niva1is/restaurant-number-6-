import { Router } from 'express';
import { STAFF_ROLES } from '../../constants/enums';
import { authenticate, authorize, requireTableToken } from '../../middlewares/auth.middleware';
import { guestRateLimiter } from '../../middlewares/rateLimiter.middleware';
import * as orderController from './order.controller';

const router = Router();
const guest = [guestRateLimiter, requireTableToken];
const staff = [authenticate, authorize(...STAFF_ROLES)];

// ─── Гость: X-Table-Token, без регистрации ───
/** POST /api/v1/orders/quote — серверный расчёт корзины без создания заказа. */
router.post('/quote', ...guest, orderController.quoteOrder);
/** POST /api/v1/orders — создать заказ: стоп-лист, снимок цен, статус ACCEPTED. */
router.post('/', ...guest, orderController.createOrder);
/** GET /api/v1/orders/my — заказы своего стола и их статусы. */
router.get('/my', ...guest, orderController.getTableOrders);

// ─── Персонал: JWT ───
/** GET /api/v1/orders/active?status=READY — витрина кухни/официанта. COOK, WAITER, ADMIN. */
router.get('/active', ...staff, orderController.getActiveOrders);
/** GET /api/v1/orders/:id — заказ с историей статусов (аудит). COOK, WAITER, ADMIN. */
router.get('/:id', ...staff, orderController.getOrderById);
/** PATCH /api/v1/orders/:id/status — смена статуса по state machine; права зависят от роли. */
router.patch('/:id/status', ...staff, orderController.changeOrderStatus);

export default router;
