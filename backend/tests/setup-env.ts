/**
 * Окружение тестов. Подключается до импорта приложения (vitest setupFiles).
 * Интеграционные тесты используют отдельную БД qr_restaurant_test (создаётся docker/postgres/init-test-db.sql),
 * чтобы не портить демонстрационные данные.
 */
import dotenv from 'dotenv';

dotenv.config();

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ||= 'test_secret_at_least_16_chars';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  (process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/qr_restaurant').replace(
    /\/qr_restaurant(\?|$)/,
    '/qr_restaurant_test$1',
  );

// Отдельный vhost RabbitMQ для тестов: тестовый consumer не трогает очередь демо-стенда.
const brokerUrl = new URL(process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672');
brokerUrl.pathname = '/qr_test';
process.env.RABBITMQ_URL = process.env.TEST_RABBITMQ_URL || brokerUrl.toString();

