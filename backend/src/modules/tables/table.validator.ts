import { z } from 'zod';

export const createTableSchema = z.object({
  number: z.string().trim().min(1, 'Номер стола обязателен').max(20),
  restaurantId: z.number().int().positive().optional(),
});

export const updateTableSchema = z.object({
  number: z.string().trim().min(1, 'Номер стола обязателен').max(20),
});

export const tableTokenParamSchema = z.object({
  token: z.string().trim(),
});

export const qrQuerySchema = z.object({
  format: z.enum(['json', 'svg', 'png']).default('json'),
});

export type CreateTableInput = z.infer<typeof createTableSchema>;
