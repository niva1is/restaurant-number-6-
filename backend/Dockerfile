# ---- build: зависимости, Prisma Client, компиляция TypeScript ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig*.json ./
COPY src ./src
RUN npm run build

# ---- runtime ----
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production \
    PRISMA_HIDE_UPDATE_MESSAGE=1
# node_modules переносится целиком: Prisma CLI (migrate deploy) и tsx (db seed) нужны при старте
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY prisma ./prisma
COPY docs ./docs
EXPOSE 5000
# При каждом старте: миграции → идемпотентный сид → сервер. Ручных шагов на чистой машине нет (NFR-08).
CMD ["sh", "-c", "npx prisma migrate deploy && npx prisma db seed && node dist/server.js"]
