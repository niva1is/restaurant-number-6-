import bcrypt from 'bcryptjs';
import { ERRORS } from '../../constants/errorMessages';
import { signStaffToken, StaffPrincipal } from '../../lib/jwt';
import { prisma } from '../../lib/prisma';
import { ApiError } from '../../utils/ApiError';
import { LoginInput } from './auth.validator';

/** Стоимость bcrypt: 2^10 итераций — стойкий хэш при приемлемом времени входа (NFR-04). */
const BCRYPT_ROUNDS = 10;

// Хэш-«пустышка» для несуществующего логина: время ответа не выдаёт, существует ли пользователь.
const DUMMY_HASH = bcrypt.hashSync('timing-attack-protection', BCRYPT_ROUNDS);

export const hashPassword = (password: string): Promise<string> => bcrypt.hash(password, BCRYPT_ROUNDS);

export const login = async ({ username, password }: LoginInput) => {
  const user = await prisma.user.findUnique({ where: { username } });
  const passwordOk = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);

  if (!user || !passwordOk) {
    throw new ApiError(401, ERRORS.INVALID_CREDENTIALS);
  }

  const principal: StaffPrincipal = { id: user.id, username: user.username, role: user.role };
  return {
    token: signStaffToken(principal),
    role: user.role,
    user: principal,
  };
};

export const getProfile = async (userId: number) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, role: true, createdAt: true },
  });
  if (!user) {
    throw new ApiError(401, ERRORS.INVALID_TOKEN);
  }
  return user;
};
