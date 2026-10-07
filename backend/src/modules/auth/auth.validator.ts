import { z } from 'zod';

export const loginSchema = z.object({
  username: z.string().trim().min(1, 'Логин обязателен').max(64),
  password: z.string().min(1, 'Пароль обязателен').max(128),
});

export type LoginInput = z.infer<typeof loginSchema>;
