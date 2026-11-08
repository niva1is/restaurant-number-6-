import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { ERRORS, ErrorDescriptor } from '../constants/errorMessages';
import { ApiError } from '../utils/ApiError';

const send = (res: Response, status: number, error: ErrorDescriptor, details?: unknown, message?: string) =>
  res.status(status).json({
    error: { code: error.code, message: message ?? error.message, ...(details !== undefined && { details }) },
  });

/** 404 для неизвестных маршрутов. */
export const notFoundHandler = (_req: Request, res: Response): void => {
  send(res, 404, ERRORS.ROUTE_NOT_FOUND);
};

/**
 * Централизованная обработка ошибок.
 * Единый формат ответа: { error: { code, message, details? } }.
 * Ошибка одного запроса не роняет процесс и не оставляет данные в промежуточном состоянии:
 * все многошаговые изменения выполняются в транзакциях (NFR-03).
 */
export const errorHandler = (err: unknown, req: Request, res: Response, _next: NextFunction): void => {
  if (err instanceof ApiError) {
    if (err.retryAfterSeconds !== undefined) {
      res.setHeader('Retry-After', String(err.retryAfterSeconds));
    }
    send(res, err.statusCode, err, err.details, err.message);
    return;
  }

  if (err instanceof ZodError) {
    const details = err.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message }));
    send(res, 400, ERRORS.VALIDATION_ERROR, details);
    return;
  }

  // Некорректный JSON в теле запроса (express.json)
  if (err instanceof SyntaxError && 'body' in err) {
    send(res, 400, ERRORS.INVALID_JSON);
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      send(res, 409, ERRORS.CONFLICT, { fields: err.meta?.target });
      return;
    }
    if (err.code === 'P2025') {
      send(res, 404, ERRORS.NOT_FOUND);
      return;
    }
    if (err.code === 'P2003') {
      send(res, 409, ERRORS.CONFLICT, undefined, 'Запись используется в других данных и не может быть изменена');
      return;
    }
  }

  // Неожиданная ошибка: детали только в лог, клиенту — общее сообщение.
  console.error(`[Error] ${req.method} ${req.originalUrl}`, err);
  send(res, 500, ERRORS.INTERNAL_ERROR);
};
