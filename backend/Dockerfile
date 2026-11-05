FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
# GitHub source refresh restores and verifies the committed npm v3 lockfile
# before this image is built. Match the dependency graph used by GitHub CI.
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY backend/ ./
# Authentication and account-security controls are versioned source files.
# Do not rewrite source during the Docker build; CI compiles the exact reviewed files.
# This placeholder is build-only and is not copied into the runtime image.
ENV DATABASE_URL=postgresql://build:build@127.0.0.1:5432/lexa?schema=public
ENV DATABASE_URL_UNPOOLED=postgresql://build:build@127.0.0.1:5432/lexa?schema=public
RUN npx prisma generate
RUN npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates python3 && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./prisma.config.ts
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/analytics ./analytics
EXPOSE 10000
# Keep the Render Docker Command override empty. One direct-connection
# migration coordinator serializes migrations, even when an idle PgBouncer
# session holds Prisma's legacy advisory lock. Runtime uses pooled DATABASE_URL.
CMD ["sh", "-c", "node scripts/migrate-with-guard.mjs && exec node dist/src/main.js"]
