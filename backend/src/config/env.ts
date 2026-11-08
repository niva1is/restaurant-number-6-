import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

/**
 * Загрузка и проверка переменных окружения.
 * Сервис не стартует с неполной конфигурацией: ошибка видна сразу, а не при первом запросе.
 */
const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(5000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  CORS_ORIGIN: z.string().default('*'),
  PUBLIC_APP_URL: z.string().url().default('http://localhost:5173'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL обязателен'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET должен быть не короче 16 символов'),
  JWT_EXPIRES_IN: z.string().default('12h'),
  RABBITMQ_URL: z.string().default('amqp://guest:guest@localhost:5672'),
  WAITER_CALL_COOLDOWN_SECONDS: z.coerce.number().int().min(0).default(30),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const problems = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  // eslint-disable-next-line no-console
  console.error(`[Config] Некорректные переменные окружения:\n${problems}\nСм. .env.example`);
  process.exit(1);
}

const env = parsed.data;

export const config = {
  port: env.PORT,
  nodeEnv: env.NODE_ENV,
  isProduction: env.NODE_ENV === 'production',
  isTest: env.NODE_ENV === 'test',
  corsOrigins: env.CORS_ORIGIN === '*' ? '*' : env.CORS_ORIGIN.split(',').map((o) => o.trim()),
  publicAppUrl: env.PUBLIC_APP_URL.replace(/\/+$/, ''),
  databaseUrl: env.DATABASE_URL,
  jwtSecret: env.JWT_SECRET,
  jwtExpiresIn: env.JWT_EXPIRES_IN,
  rabbitmqUrl: env.RABBITMQ_URL,
  waiterCallCooldownMs: env.WAITER_CALL_COOLDOWN_SECONDS * 1000,
} as const;
