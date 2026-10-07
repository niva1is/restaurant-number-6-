import { z } from 'zod';

/** :id в URL — положительное целое. */
export const idParamSchema = z.object({
  id: z.coerce.number({ invalid_type_error: 'id должен быть числом' }).int().positive('id должен быть положительным'),
});

/** Не более двух знаков после запятой (копейки). */
export const moneySchema = z
  .number({ invalid_type_error: 'Цена должна быть числом' })
  .positive('Цена должна быть больше 0')
  .max(10_000_000, 'Слишком большая цена')
  .multipleOf(0.01, 'Не более 2 знаков после запятой');
