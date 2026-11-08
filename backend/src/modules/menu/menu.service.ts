import { Prisma } from '@prisma/client';
import { ERRORS } from '../../constants/errorMessages';
import { prisma } from '../../lib/prisma';
import { ApiError } from '../../utils/ApiError';
import { toMoney } from '../../utils/money';
import { websocketService } from '../notifications/websocket.service';
import { resolveRestaurantId } from '../restaurants/restaurant.service';
import { CreateCategoryInput, CreateDishInput, UpdateCategoryInput, UpdateDishInput } from './menu.validator';

const dishInclude = {
  ingredients: { include: { ingredient: true } },
} satisfies Prisma.DishInclude;

type DishWithIngredients = Prisma.DishGetPayload<{ include: typeof dishInclude }>;

/** DTO блюда: Decimal → число, ингредиенты → массив названий. */
export const toDishDto = (dish: DishWithIngredients) => ({
  id: dish.id,
  categoryId: dish.categoryId,
  name: dish.name,
  description: dish.description,
  price: toMoney(dish.price),
  calories: dish.calories,
  imageUrl: dish.imageUrl,
  isAvailable: dish.isAvailable,
  ingredients: dish.ingredients.map((di) => di.ingredient.name).sort((a, b) => a.localeCompare(b, 'ru')),
  updatedAt: dish.updatedAt,
});

const findDishOr404 = async (id: number, db: Prisma.TransactionClient = prisma) => {
  const dish = await db.dish.findUnique({ where: { id }, include: dishInclude });
  if (!dish) throw new ApiError(404, ERRORS.DISH_NOT_FOUND);
  return dish;
};

const ensureCategory = async (id: number, db: Prisma.TransactionClient = prisma) => {
  const category = await db.category.findUnique({ where: { id }, select: { id: true } });
  if (!category) throw new ApiError(404, ERRORS.CATEGORY_NOT_FOUND);
};

/**
 * Заменяет состав блюда. Ингредиенты ищутся без учёта регистра и создаются при отсутствии,
 * поэтому «Сыр» и «сыр» не превращаются в две записи.
 */
const replaceIngredients = async (tx: Prisma.TransactionClient, dishId: number, names: string[]) => {
  // Дубли без учёта регистра отбрасываются, сохраняется первое написание.
  const byKey = new Map<string, string>();
  for (const raw of names) {
    const name = raw.trim().replace(/\s+/g, ' ');
    const key = name.toLocaleLowerCase('ru');
    if (!byKey.has(key)) byKey.set(key, name);
  }
  const unique = [...byKey.values()];

  await tx.dishIngredient.deleteMany({ where: { dishId } });

  for (const name of unique) {
    const existing = await tx.ingredient.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } },
      select: { id: true },
    });
    const ingredient =
      existing ?? (await tx.ingredient.upsert({ where: { name }, update: {}, create: { name }, select: { id: true } }));
    await tx.dishIngredient.create({ data: { dishId, ingredientId: ingredient.id } });
  }
};

// ─── Меню ────────────────────────────────────────────────────────────────────

/**
 * Публичное меню: категории с блюдами (BE-04, без регистрации).
 * Блюда из стоп-листа возвращаются с isAvailable: false, чтобы фронтенд показал их неактивными.
 */
export const getMenu = async (options: { onlyAvailable?: boolean; restaurantId?: number } = {}) => {
  const categories = await prisma.category.findMany({
    where: options.restaurantId ? { restaurantId: options.restaurantId } : undefined,
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: {
      dishes: {
        where: options.onlyAvailable ? { isAvailable: true } : undefined,
        orderBy: { name: 'asc' },
        include: dishInclude,
      },
    },
  });

  return categories.map((c) => ({
    id: c.id,
    name: c.name,
    sortOrder: c.sortOrder,
    dishes: c.dishes.map(toDishDto),
  }));
};

// ─── Категории (BE-01) ───────────────────────────────────────────────────────

export const listCategories = () =>
  prisma.category.findMany({
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, sortOrder: true, restaurantId: true, _count: { select: { dishes: true } } },
  });

export const createCategory = async (input: CreateCategoryInput) => {
  const restaurantId = await resolveRestaurantId(input.restaurantId);
  return prisma.category.create({
    data: { name: input.name, sortOrder: input.sortOrder ?? 0, restaurantId },
  });
};

export const updateCategory = async (id: number, input: UpdateCategoryInput) => {
  await ensureCategory(id);
  return prisma.category.update({ where: { id }, data: input });
};

export const deleteCategory = async (id: number) => {
  const category = await prisma.category.findUnique({
    where: { id },
    select: { id: true, _count: { select: { dishes: true } } },
  });
  if (!category) throw new ApiError(404, ERRORS.CATEGORY_NOT_FOUND);
  if (category._count.dishes > 0) {
    throw new ApiError(409, ERRORS.CATEGORY_NOT_EMPTY, { details: { dishCount: category._count.dishes } });
  }
  await prisma.category.delete({ where: { id } });
};

// ─── Блюда (BE-01) ───────────────────────────────────────────────────────────

export const getDish = async (id: number) => toDishDto(await findDishOr404(id));

export const createDish = async (input: CreateDishInput) => {
  const { ingredients, ...data } = input;

  const dish = await prisma.$transaction(async (tx) => {
    await ensureCategory(data.categoryId, tx);
    const created = await tx.dish.create({ data });
    if (ingredients?.length) await replaceIngredients(tx, created.id, ingredients);
    return findDishOr404(created.id, tx);
  });

  return toDishDto(dish);
};

/**
 * Изменение блюда. Новая цена действует только для новых заказов:
 * уже созданные заказы хранят снимок цены в order_items.ordered_price (BE-06).
 */
export const updateDish = async (id: number, input: UpdateDishInput) => {
  const { ingredients, ...data } = input;

  const dish = await prisma.$transaction(async (tx) => {
    await findDishOr404(id, tx);
    if (data.categoryId !== undefined) await ensureCategory(data.categoryId, tx);
    if (Object.keys(data).length > 0) await tx.dish.update({ where: { id }, data });
    if (ingredients) await replaceIngredients(tx, id, ingredients);
    return findDishOr404(id, tx);
  });

  if (input.isAvailable !== undefined) {
    websocketService.stopListChanged({ dishId: dish.id, name: dish.name, isAvailable: dish.isAvailable });
  }
  return toDishDto(dish);
};

/**
 * Удаление блюда. История заказов не страдает: в order_items сохранены снимки названия и цены,
 * а ссылка dish_id обнуляется (ON DELETE SET NULL).
 */
export const deleteDish = async (id: number) => {
  await findDishOr404(id);
  await prisma.dish.delete({ where: { id } });
};

// ─── Стоп-лист (BE-02) ───────────────────────────────────────────────────────

/** Устанавливает доступность блюда; без значения — переключает текущее. */
export const setStopList = async (id: number, isAvailable?: boolean) => {
  const current = await findDishOr404(id);
  const next = isAvailable ?? !current.isAvailable;

  const dish =
    next === current.isAvailable
      ? current
      : await prisma.dish.update({ where: { id }, data: { isAvailable: next }, include: dishInclude });

  websocketService.stopListChanged({ dishId: dish.id, name: dish.name, isAvailable: dish.isAvailable });
  return toDishDto(dish);
};

export const getStopList = async () => {
  const dishes = await prisma.dish.findMany({
    where: { isAvailable: false },
    orderBy: { name: 'asc' },
    include: dishInclude,
  });
  return dishes.map(toDishDto);
};

export const listIngredients = () =>
  prisma.ingredient.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } });
