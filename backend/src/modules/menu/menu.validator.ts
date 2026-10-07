import { z } from 'zod';
import { moneySchema } from '../../utils/validation';

const nonEmpty = <T extends z.ZodRawShape>(schema: z.ZodObject<T>) =>
  schema.refine((data) => Object.keys(data).length > 0, 'Передайте хотя бы одно поле для изменения');

// ─── Категории ───────────────────────────────────────────────────────────────

export const createCategorySchema = z.object({
  name: z.string().trim().min(1, 'Название категории обязательно').max(100),
  sortOrder: z.number().int().min(0).optional(),
  restaurantId: z.number().int().positive().optional(),
});

export const updateCategorySchema = nonEmpty(
  z.object({
    name: z.string().trim().min(1).max(100).optional(),
    sortOrder: z.number().int().min(0).optional(),
  }),
);

// ─── Блюда ───────────────────────────────────────────────────────────────────

const ingredientsSchema = z
  .array(z.string().trim().min(1, 'Пустое название ингредиента').max(100))
  .max(50, 'Не более 50 ингредиентов');

const dishFields = {
  categoryId: z.number({ required_error: 'categoryId обязателен' }).int().positive(),
  name: z.string().trim().min(1, 'Название блюда обязательно').max(150),
  description: z.string().trim().max(1000).nullish(),
  price: moneySchema,
  calories: z.number().int().min(0, 'Калорийность не может быть отрицательной').max(10_000).nullish(),
  imageUrl: z.string().trim().url('Некорректный URL изображения').max(500).nullish(),
  ingredients: ingredientsSchema.optional(),
  isAvailable: z.boolean().optional(),
};

export const createDishSchema = z.object(dishFields);

export const updateDishSchema = nonEmpty(z.object(dishFields).partial());

/** Тело PATCH /stop-list: без isAvailable — переключить текущее значение. */
export const stopListSchema = z.object({
  isAvailable: z.boolean().optional(),
});

export const menuQuerySchema = z.object({
  /** available=true — только блюда не из стоп-листа. */
  available: z.enum(['true', 'false']).optional(),
  restaurantId: z.coerce.number().int().positive().optional(),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type CreateDishInput = z.infer<typeof createDishSchema>;
export type UpdateDishInput = z.infer<typeof updateDishSchema>;
