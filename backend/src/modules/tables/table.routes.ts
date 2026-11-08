import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { authenticate, authorize } from '../../middlewares/auth.middleware';
import { guestRateLimiter } from '../../middlewares/rateLimiter.middleware';
import * as tableController from './table.controller';

const router = Router();
const adminOnly = [authenticate, authorize(UserRole.ADMIN)];

/** GET /api/v1/tables/check/:token — проверка QR-токена, контекст стола. Гость (публичный). */
router.get('/check/:token', guestRateLimiter, tableController.checkTableToken);

/** GET /api/v1/tables — список столов с токенами и ссылками для QR. ADMIN. */
router.get('/', ...adminOnly, tableController.listTables);
/** POST /api/v1/tables — создать стол, генерируется tableToken (UUID v4). ADMIN. */
router.post('/', ...adminOnly, tableController.createTable);
/** PATCH /api/v1/tables/:id — переименовать стол. ADMIN. */
router.patch('/:id', ...adminOnly, tableController.updateTable);
/** DELETE /api/v1/tables/:id — удалить стол без заказов. ADMIN. */
router.delete('/:id', ...adminOnly, tableController.deleteTable);
/** POST /api/v1/tables/:id/regenerate-token — перевыпустить токен (старый QR перестанет работать). ADMIN. */
router.post('/:id/regenerate-token', ...adminOnly, tableController.regenerateToken);
/** GET /api/v1/tables/:id/qr?format=json|svg|png — QR-код стола. ADMIN. */
router.get('/:id/qr', ...adminOnly, tableController.getQrCode);

export default router;
