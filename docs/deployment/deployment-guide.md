# Deployment guide

## Frontend — Vercel

- Project: `lexa_review`
- Root directory: `lexa-frontend`
- Framework: Vite
- Build: `npm run build`
- Output: `dist`
- API proxy: configured in `lexa-frontend/vercel.json` to the existing Render API.

## Backend — Render

- Service: `lexa-backend-api-live`
- Runtime: Docker
- Dockerfile: `backend/Dockerfile`
- Docker context: repository root
- Database: existing Neon PostgreSQL database `lexa`.

Keep the existing service and database. Merge environment-variable updates into the service's private settings; do not replace or expose secrets in source control. A code archive does not deploy the service or update provider settings by itself.

## Database migrations

The active Prisma migration directories are production history, not temporary implementation files. The names are persisted in `_prisma_migrations`; keep them exact. Apply only reviewed forward migrations using the approved Render release process. Do not rename or edit applied migration folders, and never use `prisma migrate dev` on production.
