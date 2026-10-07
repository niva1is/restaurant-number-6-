import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { UserRole } from '@prisma/client';
import { ERRORS } from '../constants/errorMessages';
import { verifyStaffToken } from '../lib/jwt';
import { prisma } from '../lib/prisma';
import { ApiError } from '../utils/ApiError';

/**
 * Аутентификация сотрудника по JWT (заголовок Authorization: Bearer <token>).
 * Токен персонала и токен стола — разные сущности: этот middleware принимает только JWT.
 */
export const authenticate = (req: Request, _res: Response, next: NextFunction): void => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw new ApiError(401, ERRORS.UNAUTHORIZED);
  }

  const principal = verifyStaffToken(header.slice('Bearer '.length).trim());
  if (!principal) {
    throw new ApiError(401, ERRORS.INVALID_TOKEN);
  }

  req.user = principal;
  next();
};

/**
 * Проверка роли (roleCheck). Используется после authenticate.
 * Скрытая кнопка на фронтенде не является защитой — права проверяет сервер.
 */
export const authorize =
  (...allowedRoles: UserRole[]) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new ApiError(401, ERRORS.UNAUTHORIZED);
    }
    if (!allowedRoles.includes(req.user.role)) {
      throw new ApiError(403, ERRORS.FORBIDDEN, { details: { requiredRoles: allowedRoles } });
    }
    next();
  };

const tableTokenSchema = z.string().uuid();

/**
 * Гостевой доступ без регистрации: заголовок X-Table-Token (UUID из QR-кода).
 * По токену восстанавливается контекст стола (BE-04); номер стола из тела запроса не принимается,
 * поэтому подделать стол перебором последовательных ID нельзя (BE-03).
 */
export const requireTableToken = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
  const raw = req.header('x-table-token');
  if (!raw) {
    throw new ApiError(401, ERRORS.TABLE_TOKEN_REQUIRED);
  }

  const token = tableTokenSchema.safeParse(raw.trim());
  if (!token.success) {
    throw new ApiError(401, ERRORS.INVALID_TABLE_TOKEN);
  }

  const table = await prisma.table.findUnique({
    where: { tableToken: token.data },
    select: { id: true, number: true, restaurantId: true },
  });
  if (!table) {
    throw new ApiError(401, ERRORS.INVALID_TABLE_TOKEN);
  }

  req.table = table;
  next();
};
