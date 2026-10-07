import { Request, Response } from 'express';
import * as notificationService from './notification.service';
import { eventIdParamSchema } from './notification.validator';

/** 201 — создан новый вызов; 200 — у стола уже есть активный вызов, возвращён он (дубль не создан). */
export const callWaiter = async (req: Request, res: Response) => {
  const result = await notificationService.callWaiter(req.table!);
  res.status(result.duplicate ? 200 : 201).json(result);
};

export const resolveWaiterCall = async (req: Request, res: Response) => {
  const { eventId } = eventIdParamSchema.parse(req.params);
  res.json(await notificationService.resolveWaiterCall(eventId, req.user!));
};

export const getActiveWaiterCalls = async (_req: Request, res: Response) => {
  res.json(await notificationService.getActiveWaiterCalls());
};
