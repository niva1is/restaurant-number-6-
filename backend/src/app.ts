import cors from 'cors';
import express, { Express } from 'express';
import helmet from 'helmet';
import { config } from './config/env';
import { createDocsRouter } from './docs/swagger';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler.middleware';
import { globalRateLimiter } from './middlewares/rateLimiter.middleware';
import { requestLogger } from './middlewares/requestLogger.middleware';
import routes, { API_PREFIX } from './routes';

/**
 * Настройка Express. Порядок middleware:
 *   CORS → Swagger UI → Helmet → журнал запросов → JSON → общий rate limit → маршруты /api/v1 → 404 → ошибки.
 * Приложение создаётся без запуска сервера, поэтому его можно тестировать через Supertest.
 */
export const createApp = (): Express => {
  const app = express();
  app.disable('x-powered-by');

  app.use(cors({ origin: config.corsOrigins, exposedHeaders: ['Retry-After'] }));

  // Документация до helmet: Swagger UI использует inline-стили, которые запрещает строгая CSP.
  app.use('/api/docs', createDocsRouter());

  app.use(helmet());
  if (!config.isTest) app.use(requestLogger);
  app.use(express.json({ limit: '100kb' }));
  app.use(globalRateLimiter);

  app.use(API_PREFIX, routes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
