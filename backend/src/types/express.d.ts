import type { StaffPrincipal } from '../lib/jwt';
import type { TableContext } from './context';

declare global {
  namespace Express {
    interface Request {
      /** Сотрудник (заполняет authenticate). */
      user?: StaffPrincipal;
      /** Стол гостя (заполняет requireTableToken). */
      table?: TableContext;
    }
  }
}

export {};
