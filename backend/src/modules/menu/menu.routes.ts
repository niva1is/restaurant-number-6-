import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { STAFF_ROLES } from '../../constants/enums';
import { authenticate, authorize } from '../../middlewares/auth.middleware';
import * as menuController from './menu.controller';

const router = Router();
const adminOnly = [authenticate, authorize(UserRole.ADMIN)];

/** GET /api/v1/menu — меню с категориями и блюдами. Публичный (гость без регистрации). */
router.get('/', menuController.getMenu);

// ─── Категории ───
/** GET /api/v1/menu/categories — список категорий. Публичный. */
router.get('/categories', menuController.listCategories);
/** POST /api/v1/menu/categories — создать категорию. ADMIN. */
router.post('/categories', ...adminOnly, menuController.createCategory);
/** PATCH /api/v1/menu/categories/:id — изменить категорию. ADMIN. */
router.patch('/categories/:id', ...adminOnly, menuController.updateCategory);
/** DELETE /api/v1/menu/categories/:id — удалить пустую категорию. ADMIN. */
router.delete('/categories/:id', ...adminOnly, menuController.deleteCategory);

// ─── Справочники ───
/** GET /api/v1/menu/ingredients — справочник ингредиентов. Публичный. */
router.get('/ingredients', menuController.listIngredients);
/** GET /api/v1/menu/stop-list — блюда в стоп-листе. Персонал. */
router.get('/stop-list', authenticate, authorize(...STAFF_ROLES), menuController.getStopList);

// ─── Блюда ───
/** GET /api/v1/menu/dishes/:id — карточка блюда. Публичный. */
router.get('/dishes/:id', menuController.getDish);
/** POST /api/v1/menu/dishes — создать блюдо. ADMIN. */
router.post('/dishes', ...adminOnly, menuController.createDish);
/** PATCH /api/v1/menu/dishes/:id — изменить блюдо. ADMIN. */
router.patch('/dishes/:id', ...adminOnly, menuController.updateDish);
/** DELETE /api/v1/menu/dishes/:id — удалить блюдо. ADMIN. */
router.delete('/dishes/:id', ...adminOnly, menuController.deleteDish);
/** PATCH /api/v1/menu/dishes/:id/stop-list — стоп-лист (переключить или задать isAvailable). ADMIN, COOK. */
router.patch('/dishes/:id/stop-list', authenticate, authorize(UserRole.ADMIN, UserRole.COOK), menuController.setStopList);

export default router;
