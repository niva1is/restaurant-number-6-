import { NextFunction, Request, Response } from 'express';

/** Журнал запросов: метод, путь, статус, время ответа, инициатор (роль или стол). */
export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  const started = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    const who = req.user ? `${req.user.role}:${req.user.username}` : req.table ? `guest:table-${req.table.number}` : 'anonymous';
    console.log(`[HTTP] ${req.method} ${req.originalUrl} ${res.statusCode} ${ms.toFixed(1)}ms (${who})`);
  });
  next();
};
