import { Prisma } from '@prisma/client';

/**
 * Денежные значения хранятся в БД как DECIMAL(10,2) и считаются через Prisma.Decimal,
 * чтобы избежать ошибок округления float (0.1 + 0.2). Наружу (JSON) отдаются числом.
 */
export type MoneyInput = Prisma.Decimal | number | string;

export const toDecimal = (value: MoneyInput): Prisma.Decimal => new Prisma.Decimal(value);

export const toMoney = (value: MoneyInput): number => Number(toDecimal(value).toFixed(2));
