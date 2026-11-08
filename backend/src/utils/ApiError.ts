import { ErrorDescriptor } from '../constants/errorMessages';

/**
 * Ожидаемая (бизнес-) ошибка с HTTP-статусом.
 * Обрабатывается errorHandler и превращается в ответ { error: { code, message, details } }.
 */
export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;
  /** Значение заголовка Retry-After (секунды) для ответов 429. */
  readonly retryAfterSeconds?: number;

  constructor(
    statusCode: number,
    error: ErrorDescriptor,
    options: { message?: string; details?: unknown; retryAfterSeconds?: number } = {},
  ) {
    super(options.message ?? error.message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = error.code;
    this.details = options.details;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }
}
