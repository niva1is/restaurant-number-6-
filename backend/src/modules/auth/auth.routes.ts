import { Router } from 'express';
import { authenticate } from '../../middlewares/auth.middleware';
import { loginRateLimiter } from '../../middlewares/rateLimiter.middleware';
import * as authController from './auth.controller';

const router = Router();

/** POST /api/v1/auth/login — вход персонала. Публичный. Возвращает JWT и роль. */
router.post('/login', loginRateLimiter, authController.login);

/** GET /api/v1/auth/me — профиль текущего сотрудника. Любая роль персонала. */
router.get('/me', authenticate, authController.me);

export default router;
