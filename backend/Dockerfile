FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY backend/package.json ./package.json
RUN npm install
COPY backend/ ./
# Prisma config is evaluated during generation; this value is build-only and is
# not copied into the runtime image. The deployed service must inject DATABASE_URL.
ENV DATABASE_URL=postgresql://build:build@127.0.0.1:5432/lexa?schema=public
RUN npx prisma generate
RUN npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./prisma.config.ts
EXPOSE 10000
# Uses the production-safe migration command, never migrate dev.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
