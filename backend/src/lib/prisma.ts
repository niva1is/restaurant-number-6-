import { PrismaClient } from '@prisma/client';
import { config } from '../config/env';

declare global {
  // Один клиент на процесс: при hot-reload в разработке не плодим подключения к БД.
  // eslint-disable-next-line no-var
  var prismaClient: PrismaClient | undefined;
}

export const prisma =
  global.prismaClient ??
  new PrismaClient({
    // Ошибки запросов не логируются здесь: ожидаемые (например, гонка за UNIQUE) обрабатываются в сервисах,
    // неожиданные — в errorHandler.
    log: ['warn'],
  });

if (!config.isProduction) global.prismaClient = prisma;
