import { Request, Response } from 'express';
import { idParamSchema } from '../../utils/validation';
import * as orderService from './order.service';
import { activeOrdersQuerySchema, changeStatusSchema, createOrderSchema, quoteOrderSchema } from './order.validator';

// Гость (контекст стола из X-Table-Token)
export const quoteOrder = async (req: Request, res: Response) => {
  const { items } = quoteOrderSchema.parse(req.body);
  res.json(await orderService.quoteOrder(req.table!, items));
};

export const createOrder = async (req: Request, res: Response) => {
  const input = createOrderSchema.parse(req.body);
  res.status(201).json(await orderService.createOrder(req.table!, input));
};

export const getTableOrders = async (req: Request, res: Response) => {
  res.json(await orderService.getTableOrders(req.table!));
};

// Персонал (JWT)
export const getActiveOrders = async (req: Request, res: Response) => {
  const { status } = activeOrdersQuerySchema.parse(req.query);
  res.json(await orderService.getActiveOrders(req.user!.role, status));
};

export const getOrderById = async (req: Request, res: Response) => {
  const { id } = idParamSchema.parse(req.params);
  res.json(await orderService.getOrderById(id, req.user!.role));
};

export const changeOrderStatus = async (req: Request, res: Response) => {
  const { id } = idParamSchema.parse(req.params);
  const { status, reason } = changeStatusSchema.parse(req.body);
  res.json(await orderService.changeOrderStatus(id, status, req.user!, reason));
};
