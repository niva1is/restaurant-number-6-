import http from 'http';
import { Namespace, Server, Socket } from 'socket.io';
import { z } from 'zod';
import { UserRole } from '@prisma/client';
import { config } from '../../config/env';
import { STAFF_ROLES, WSEvent } from '../../constants/enums';
import { StaffPrincipal, verifyStaffToken } from '../../lib/jwt';
import { prisma } from '../../lib/prisma';

/**
 * WebSocket-шлюз (Socket.io): мгновенная доставка событий в браузер без polling БД (BE-09).
 *
 * Пространства имён:
 *   "/"      — персонал. Подключение только с валидным JWT (handshake auth.token или Authorization: Bearer).
 *              Сокет попадает в комнату role:<ROLE>.
 *   "/guest" — гость стола. Подключение только с валидным tableToken (handshake auth.tableToken).
 *              Сокет попадает в комнату table:<id> и получает события только своего стола.
 */

export interface WaiterCallEventPayload {
  eventId: string;
  type: 'WAITER_CALL';
  tableId: number;
  tableNumber: string;
  timestamp: string;
  /** true, если брокер доставляет сообщение повторно (после переподключения). eventId тот же. */
  redelivered: boolean;
}

export interface WaiterCallResolvedPayload {
  eventId: string;
  tableId: number;
  resolvedAt: string;
  resolvedBy: { id: number; username: string } | null;
}

export interface OrderStatusChangedPayload {
  orderId: number;
  tableId: number;
  tableNumber: string;
  fromStatus: string | null;
  toStatus: string;
  changedBy: { id: number; role: UserRole } | null;
  timestamp: string;
}

export interface StopListChangedPayload {
  dishId: number;
  name: string;
  isAvailable: boolean;
}

const tableTokenSchema = z.string().uuid();

const extractBearer = (socket: Socket): string | undefined => {
  const fromAuth = socket.handshake.auth?.token;
  if (typeof fromAuth === 'string' && fromAuth) return fromAuth.replace(/^Bearer\s+/i, '');
  const header = socket.handshake.headers.authorization;
  return header?.startsWith('Bearer ') ? header.slice(7) : undefined;
};

class WebSocketService {
  private io: Server | null = null;
  private guests: Namespace | null = null;

  init(server: http.Server): Server {
    this.io = new Server(server, {
      cors: { origin: config.corsOrigins, methods: ['GET', 'POST'] },
    });

    // ── Персонал ────────────────────────────────────────────────────────────
    this.io.use((socket, next) => {
      const token = extractBearer(socket);
      const principal = token ? verifyStaffToken(token) : null;
      if (!principal) {
        next(new Error('UNAUTHORIZED: требуется JWT сотрудника'));
        return;
      }
      socket.data.user = principal;
      next();
    });

    this.io.on('connection', (socket) => {
      const user = socket.data.user as StaffPrincipal;
      socket.join(`role:${user.role}`);
      console.log(`[WS] Сотрудник подключился: ${user.username} (${user.role})`);
      socket.on('disconnect', (reason) => console.log(`[WS] Сотрудник отключился: ${user.username} (${reason})`));
    });

    // ── Гости ───────────────────────────────────────────────────────────────
    this.guests = this.io.of('/guest');

    this.guests.use(async (socket, next) => {
      const raw = socket.handshake.auth?.tableToken ?? socket.handshake.headers['x-table-token'];
      const parsed = tableTokenSchema.safeParse(raw);
      if (!parsed.success) {
        next(new Error('INVALID_TABLE_TOKEN'));
        return;
      }
      try {
        const table = await prisma.table.findUnique({
          where: { tableToken: parsed.data },
          select: { id: true, number: true },
        });
        if (!table) {
          next(new Error('INVALID_TABLE_TOKEN'));
          return;
        }
        socket.data.table = table;
        next();
      } catch (error) {
        next(error as Error);
      }
    });

    this.guests.on('connection', (socket) => {
      const table = socket.data.table as { id: number; number: string };
      socket.join(`table:${table.id}`);
    });

    return this.io;
  }

  private emitToRoles(roles: UserRole[], event: WSEvent, payload: unknown): void {
    if (!this.io) return;
    this.io.to(roles.map((r) => `role:${r}`)).emit(event, payload);
  }

  private emitToTable(tableId: number, event: WSEvent, payload: unknown): void {
    this.guests?.to(`table:${tableId}`).emit(event, payload);
  }

  /** Новый заказ — кухонный терминал и панель официанта (FE-04). */
  orderCreated(order: { id: number; tableId: number } & Record<string, unknown>): void {
    this.emitToRoles(STAFF_ROLES, WSEvent.ORDER_CREATED, order);
  }

  /** Смена статуса — персоналу и гостю этого стола (FE-03). */
  orderStatusChanged(payload: OrderStatusChangedPayload): void {
    this.emitToRoles(STAFF_ROLES, WSEvent.ORDER_STATUS_CHANGED, payload);
    this.emitToTable(payload.tableId, WSEvent.ORDER_STATUS_CHANGED, payload);
  }

  /** Вызов официанта — только официантам и администраторам (FE-05). */
  newWaiterCall(payload: WaiterCallEventPayload): void {
    this.emitToRoles([UserRole.WAITER, UserRole.ADMIN], WSEvent.NEW_WAITER_CALL, payload);
  }

  /** Вызов принят — убрать его с панелей всех официантов и сообщить гостю. */
  waiterCallResolved(payload: WaiterCallResolvedPayload): void {
    this.emitToRoles([UserRole.WAITER, UserRole.ADMIN], WSEvent.WAITER_CALL_RESOLVED, payload);
    this.emitToTable(payload.tableId, WSEvent.WAITER_CALL_RESOLVED, payload);
  }

  /** Изменение стоп-листа — меню у гостей и персонала обновляется без перезагрузки. */
  stopListChanged(payload: StopListChangedPayload): void {
    this.emitToRoles(STAFF_ROLES, WSEvent.STOP_LIST_CHANGED, payload);
    this.guests?.emit(WSEvent.STOP_LIST_CHANGED, payload);
  }

  async close(): Promise<void> {
    if (!this.io) return;
    await new Promise<void>((resolve) => this.io!.close(() => resolve()));
    this.io = null;
    this.guests = null;
  }
}

export const websocketService = new WebSocketService();
