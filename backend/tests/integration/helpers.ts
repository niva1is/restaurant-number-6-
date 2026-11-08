import { execSync } from 'child_process';
import path from 'path';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import type { Express } from 'express';
import { UserRole } from '@prisma/client';
import { prisma } from '../../src/lib/prisma';

const ROOT = path.resolve(__dirname, '../..');

export const STAFF_PASSWORD = 'test-password';

/** Применяет миграции к тестовой БД (DATABASE_URL подменён в tests/setup-env.ts). */
export const migrateTestDatabase = (): void => {
  execSync('npx prisma migrate deploy', { cwd: ROOT, env: process.env, stdio: 'pipe' });
};

/** Полная очистка данных между наборами тестов. */
export const resetDatabase = async (): Promise<void> => {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE order_status_events, order_items, orders, waiter_calls,
      dish_ingredients, ingredients, dishes, categories, tables, restaurants, users
    RESTART IDENTITY CASCADE
  `);
};

export const createStaff = async (): Promise<void> => {
  const passwordHash = await bcrypt.hash(STAFF_PASSWORD, 4);
  await prisma.user.createMany({
    data: [
      { username: 'admin', role: UserRole.ADMIN, passwordHash },
      { username: 'cook', role: UserRole.COOK, passwordHash },
      { username: 'waiter', role: UserRole.WAITER, passwordHash },
    ],
  });
};

export const login = async (app: Express, username: string): Promise<string> => {
  const res = await request(app).post('/api/v1/auth/login').send({ username, password: STAFF_PASSWORD });
  if (res.status !== 200) throw new Error(`login ${username}: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.token as string;
};

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
export const tableHeader = (tableToken: string) => ({ 'X-Table-Token': tableToken });
