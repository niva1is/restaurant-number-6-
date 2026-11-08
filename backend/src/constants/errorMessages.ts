/**
 * Коды и тексты ошибок API.
 * code — стабильный машиночитаемый идентификатор для фронтенда,
 * message — понятное пользователю сообщение (NFR-05).
 */
export const ERRORS = {
  // Общие
  VALIDATION_ERROR: { code: 'VALIDATION_ERROR', message: 'Ошибка валидации входных данных' },
  INVALID_JSON: { code: 'INVALID_JSON', message: 'Тело запроса не является корректным JSON' },
  NOT_FOUND: { code: 'NOT_FOUND', message: 'Ресурс не найден' },
  ROUTE_NOT_FOUND: { code: 'ROUTE_NOT_FOUND', message: 'Маршрут не найден' },
  CONFLICT: { code: 'CONFLICT', message: 'Запись с такими данными уже существует' },
  TOO_MANY_REQUESTS: { code: 'TOO_MANY_REQUESTS', message: 'Слишком много запросов, попробуйте позже' },
  INTERNAL_ERROR: { code: 'INTERNAL_ERROR', message: 'Внутренняя ошибка сервера' },

  // Аутентификация и доступ
  INVALID_CREDENTIALS: { code: 'INVALID_CREDENTIALS', message: 'Неверный логин или пароль' },
  UNAUTHORIZED: { code: 'UNAUTHORIZED', message: 'Требуется авторизация сотрудника' },
  INVALID_TOKEN: { code: 'INVALID_TOKEN', message: 'Недействительный или просроченный токен' },
  FORBIDDEN: { code: 'FORBIDDEN', message: 'Недостаточно прав для выполнения операции' },

  // Столы
  TABLE_TOKEN_REQUIRED: { code: 'TABLE_TOKEN_REQUIRED', message: 'Отсканируйте QR-код стола' },
  INVALID_TABLE_TOKEN: { code: 'INVALID_TABLE_TOKEN', message: 'QR-код стола недействителен' },
  TABLE_NOT_FOUND: { code: 'TABLE_NOT_FOUND', message: 'Стол не найден' },
  TABLE_HAS_ORDERS: { code: 'TABLE_HAS_ORDERS', message: 'Нельзя удалить стол, по которому есть заказы' },
  RESTAURANT_NOT_FOUND: { code: 'RESTAURANT_NOT_FOUND', message: 'Ресторан не найден' },

  // Меню
  CATEGORY_NOT_FOUND: { code: 'CATEGORY_NOT_FOUND', message: 'Категория не найдена' },
  CATEGORY_NOT_EMPTY: {
    code: 'CATEGORY_NOT_EMPTY',
    message: 'В категории есть блюда — удалите или перенесите их перед удалением категории',
  },
  DISH_NOT_FOUND: { code: 'DISH_NOT_FOUND', message: 'Блюдо не найдено' },
  DISH_IN_STOP_LIST: { code: 'DISH_IN_STOP_LIST', message: 'Блюдо временно недоступно (стоп-лист)' },

  // Заказы
  ORDER_NOT_FOUND: { code: 'ORDER_NOT_FOUND', message: 'Заказ не найден' },
  PRICE_CHANGED: {
    code: 'PRICE_CHANGED',
    message: 'Цены в меню изменились — проверьте корзину и подтвердите заказ ещё раз',
  },
  INVALID_STATUS_TRANSITION: { code: 'INVALID_STATUS_TRANSITION', message: 'Недопустимый переход статуса заказа' },
  TRANSITION_FORBIDDEN_FOR_ROLE: {
    code: 'TRANSITION_FORBIDDEN_FOR_ROLE',
    message: 'Ваша роль не может выполнить этот переход статуса',
  },
  ORDER_STATUS_CONFLICT: {
    code: 'ORDER_STATUS_CONFLICT',
    message: 'Статус заказа уже изменён другим сотрудником — обновите данные',
  },

  // Вызов официанта
  WAITER_CALL_RATE_LIMITED: {
    code: 'WAITER_CALL_RATE_LIMITED',
    message: 'Официант уже вызван — повторный вызов пока недоступен',
  },
  WAITER_CALL_NOT_FOUND: { code: 'WAITER_CALL_NOT_FOUND', message: 'Вызов официанта не найден' },
} as const;

export type ErrorDescriptor = { code: string; message: string };
