import rateLimit from 'express-rate-limit';
import { ERRORS } from '../constants/errorMessages';
import { config } from '../config/env';

/**
 * Ограничения частоты запросов по IP (защита API от перебора и флуда).
 *
 * Отдельно от них в notification.service работает бизнес-ограничение BE-10:
 * «не чаще 1 вызова официанта в 30 секунд с одного стола». Оно считается по данным БД,
 * а не по IP, потому что за одним столом может сидеть несколько гостей с разных устройств.
 */

const tooMany = { error: ERRORS.TOO_MANY_REQUESTS };

// В тестах лимиты по IP отключены: все запросы идут с 127.0.0.1.
const skip = () => config.isTest;

/** Общий лимит на всё API. */
export const globalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: tooMany,
  skip,
});

/** Вход персонала: защита от подбора пароля. */
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: { ...ERRORS.TOO_MANY_REQUESTS, message: 'Слишком много попыток входа, попробуйте через 15 минут' } },
  skip,
});

/** Гостевые операции по токену стола: затрудняет перебор токенов (BE-03). */
export const guestRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: tooMany,
  skip,
});
