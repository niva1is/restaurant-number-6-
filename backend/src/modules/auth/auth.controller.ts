import { Request, Response } from 'express';
import * as authService from './auth.service';
import { loginSchema } from './auth.validator';

export const login = async (req: Request, res: Response) => {
  const input = loginSchema.parse(req.body);
  res.json(await authService.login(input));
};

export const me = async (req: Request, res: Response) => {
  res.json(await authService.getProfile(req.user!.id));
};
