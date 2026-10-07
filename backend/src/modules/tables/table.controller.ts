import { Request, Response } from 'express';
import { idParamSchema } from '../../utils/validation';
import * as tableService from './table.service';
import { createTableSchema, qrQuerySchema, tableTokenParamSchema, updateTableSchema } from './table.validator';

export const listTables = async (_req: Request, res: Response) => {
  res.json(await tableService.listTables());
};

export const createTable = async (req: Request, res: Response) => {
  res.status(201).json(await tableService.createTable(createTableSchema.parse(req.body)));
};

export const updateTable = async (req: Request, res: Response) => {
  const { id } = idParamSchema.parse(req.params);
  const { number } = updateTableSchema.parse(req.body);
  res.json(await tableService.updateTable(id, number));
};

export const deleteTable = async (req: Request, res: Response) => {
  const { id } = idParamSchema.parse(req.params);
  await tableService.deleteTable(id);
  res.status(204).send();
};

export const regenerateToken = async (req: Request, res: Response) => {
  const { id } = idParamSchema.parse(req.params);
  res.json(await tableService.regenerateToken(id));
};

export const getQrCode = async (req: Request, res: Response) => {
  const { id } = idParamSchema.parse(req.params);
  const { format } = qrQuerySchema.parse(req.query);
  const qr = await tableService.getQrCode(id, format);
  if (qr.type === 'json') {
    res.json(qr.body);
    return;
  }
  res.type(qr.type).send(qr.body);
};

export const checkTableToken = async (req: Request, res: Response) => {
  const { token } = tableTokenParamSchema.parse(req.params);
  res.json(await tableService.checkTableToken(token));
};
