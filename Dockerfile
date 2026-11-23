FROM node:22-alpine AS build
WORKDIR /app
# prisma generate reads prisma.config.ts; the URL is not used at generate time
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY package.json prisma.config.ts ./
EXPOSE 3333
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/main"]
