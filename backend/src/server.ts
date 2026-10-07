import http from 'http';
import { AddressInfo } from 'net';
import { createApp } from './app';
import { API_PREFIX } from './routes';
import { config } from './config/env';
import { prisma } from './lib/prisma';
import { republishPendingCalls } from './modules/notifications/notification.service';
import { rabbitMQService } from './modules/notifications/rabbitmq.service';
import { websocketService } from './modules/notifications/websocket.service';

export interface RunningServer {
  server: http.Server;
  port: number;
  stop: () => Promise<void>;
}

/**
 * Запуск: PostgreSQL → HTTP (Express) + WebSocket (Socket.io) → RabbitMQ (publisher + consumer).
 * Без БД сервис не стартует. Без брокера — стартует и переподключается в фоне:
 * заказы работают, вызовы сохраняются и публикуются после восстановления брокера.
 */
export const startServer = async (port = config.port): Promise<RunningServer> => {
  await prisma.$connect();
  console.log('[Database] Подключено к PostgreSQL');

  const server = http.createServer(createApp());
  websocketService.init(server);

  await new Promise<void>((resolve) => server.listen(port, resolve));
  const actualPort = (server.address() as AddressInfo).port;

  rabbitMQService.onReady(async () => {
    await republishPendingCalls();
  });
  await rabbitMQService.start();

  console.log(`[Server] http://localhost:${actualPort}${API_PREFIX} (${config.nodeEnv})`);
  console.log(`[Server] Swagger UI: http://localhost:${actualPort}/api/docs`);

  const stop = async () => {
    await rabbitMQService.stop();
    await websocketService.close(); // закрывает и HTTP-сервер
    await new Promise<void>((resolve) => (server.listening ? server.close(() => resolve()) : resolve()));
    await prisma.$disconnect();
  };

  return { server, port: actualPort, stop };
};

if (require.main === module) {
  startServer()
    .then(({ stop }) => {
      const shutdown = async (signal: string) => {
        console.log(`\n[Server] ${signal}: остановка...`);
        await stop();
        console.log('[Server] Остановлен');
        process.exit(0);
      };
      process.on('SIGINT', () => void shutdown('SIGINT'));
      process.on('SIGTERM', () => void shutdown('SIGTERM'));
    })
    .catch((error) => {
      console.error('[Server] Не удалось запустить:', error);
      process.exit(1);
    });

  // Ошибка в одном обработчике не должна молча оставлять процесс в неопределённом состоянии.
  process.on('unhandledRejection', (reason) => console.error('[Server] Unhandled rejection:', reason));
}
