import { Router } from 'express';
import { prisma } from './lib/prisma';
import authRoutes from './modules/auth/auth.routes';
import menuRoutes from './modules/menu/menu.routes';
import notificationRoutes from './modules/notifications/notification.routes';
import { rabbitMQService } from './modules/notifications/rabbitmq.service';
import orderRoutes from './modules/orders/order.routes';
import tableRoutes from './modules/tables/table.routes';

/**
 * Единый реестр маршрутов. Версия API — в префиксе /api/v1.
 *   /auth          — вход персонала (JWT)
 *   /menu          — меню, категории, блюда, стоп-лист
 *   /tables        — столы, QR-токены
 *   /orders        — заказы и state machine
 *   /notifications — вызов официанта (RabbitMQ + WebSocket)
 */
export const API_PREFIX = '/api/v1';

const router = Router();

router.use('/auth', authRoutes);
router.use('/menu', menuRoutes);
router.use('/tables', tableRoutes);
router.use('/orders', orderRoutes);
router.use('/notifications', notificationRoutes);

/** GET /api/v1/health — состояние сервиса и зависимостей. */
router.get('/health', async (_req, res) => {
  const database = await prisma.$queryRaw`SELECT 1`.then(
    () => 'up' as const,
    () => 'down' as const,
  );
  const broker = rabbitMQService.isConnected() ? 'up' : 'down';
  res.status(database === 'up' ? 200 : 503).json({
    status: database === 'up' ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    services: { database, broker },
  });
});

export default router;
