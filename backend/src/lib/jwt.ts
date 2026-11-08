import jwt, { SignOptions } from 'jsonwebtoken';
import { z } from 'zod';
import { UserRole } from '@prisma/client';
import { config } from '../config/env';

/** Данные сотрудника, зашитые в JWT. Роль проверяется сервером на каждом запросе. */
export interface StaffPrincipal {
  id: number;
  username: string;
  role: UserRole;
}

const payloadSchema = z.object({
  sub: z.string().regex(/^\d+$/),
  username: z.string(),
  role: z.nativeEnum(UserRole),
});

export const signStaffToken = (user: StaffPrincipal): string =>
  jwt.sign({ username: user.username, role: user.role }, config.jwtSecret, {
    subject: String(user.id),
    expiresIn: config.jwtExpiresIn as SignOptions['expiresIn'],
  });

/** Возвращает сотрудника из токена или null, если токен невалиден, просрочен или подделан. */
export const verifyStaffToken = (token: string): StaffPrincipal | null => {
  try {
    const decoded = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
    const payload = payloadSchema.parse(decoded);
    return { id: Number(payload.sub), username: payload.username, role: payload.role };
  } catch {
    return null;
  }
};
