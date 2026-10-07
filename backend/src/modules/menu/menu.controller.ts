import { Request, Response } from 'express';
import { idParamSchema } from '../../utils/validation';
import * as menuService from './menu.service';
import {
  createCategorySchema,
  createDishSchema,
  menuQuerySchema,
  stopListSchema,
  updateCategorySchema,
  updateDishSchema,
} from './menu.validator';

export const getMenu = async (req: Request, res: Response) => {
  const query = menuQuerySchema.parse(req.query);
  res.json(await menuService.getMenu({ onlyAvailable: query.available === 'true', restaurantId: query.restaurantId }));
};

// Категории
export const listCategories = async (_req: Request, res: Response) => {
  res.json(await menuService.listCategories());
};

export const createCategory = async (req: Request, res: Response) => {
  res.status(201).json(await menuService.createCategory(createCategorySchema.parse(req.body)));
};

export const updateCategory = async (req: Request, res: Response) => {
  const { id } = idParamSchema.parse(req.params);
  res.json(await menuService.updateCategory(id, updateCategorySchema.parse(req.body)));
};

export const deleteCategory = async (req: Request, res: Response) => {
  const { id } = idParamSchema.parse(req.params);
  await menuService.deleteCategory(id);
  res.status(204).send();
};

// Блюда
export const getDish = async (req: Request, res: Response) => {
  const { id } = idParamSchema.parse(req.params);
  res.json(await menuService.getDish(id));
};

export const createDish = async (req: Request, res: Response) => {
  res.status(201).json(await menuService.createDish(createDishSchema.parse(req.body)));
};

export const updateDish = async (req: Request, res: Response) => {
  const { id } = idParamSchema.parse(req.params);
  res.json(await menuService.updateDish(id, updateDishSchema.parse(req.body)));
};

export const deleteDish = async (req: Request, res: Response) => {
  const { id } = idParamSchema.parse(req.params);
  await menuService.deleteDish(id);
  res.status(204).send();
};

// Стоп-лист и ингредиенты
export const setStopList = async (req: Request, res: Response) => {
  const { id } = idParamSchema.parse(req.params);
  const { isAvailable } = stopListSchema.parse(req.body ?? {});
  res.json(await menuService.setStopList(id, isAvailable));
};

export const getStopList = async (_req: Request, res: Response) => {
  res.json(await menuService.getStopList());
};

export const listIngredients = async (_req: Request, res: Response) => {
  res.json(await menuService.listIngredients());
};
