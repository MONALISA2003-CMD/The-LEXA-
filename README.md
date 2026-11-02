# LEXA

LEXA is a multi-tenant business management platform for sales, inventory, finance, procurement, people operations, reporting and administration.

## Architecture

The repository has one application source tree for each runtime:

```text
.
├── backend/                  # NestJS API, Prisma schema, migrations and tests
├── lexa-frontend/            # React + TypeScript + Vite web application
├── docs/                     # Architecture, security, deployment and operator guidance
├── scripts/                  # Repository cleanup and validation
├── .github/workflows/        # Application CI and safe repository import
└── render.yaml               # Existing Render API service configuration
```

There is exactly one active backend and one active frontend. The AI router runs inside the backend API. The backend also contains the worker entry point for a separately approved deployment. Never place a repository copy inside another directory or commit downloaded source ZIP files.

## Local development

Use Node.js 22 (see `.nvmrc`).

**Frontend**

```bash
cd lexa-frontend
npm install
npm run test
npm run build
```

**Backend**

```bash
cd backend
cp .env.example .env
# Set a development-only Neon branch URL in .env.
npm install
npm test
npm run build
```

Do not use production credentials for local development. `npm run build` in the frontend runs the unit suite before TypeScript and Vite compilation.

## Connected deployment topology

- **Frontend:** Vercel project `lexa_review`, root directory `lexa-frontend`, framework Vite, output `dist`.
- **API:** existing Render service `lexa-backend-api-live`, Dockerfile `backend/Dockerfile`, repository-root Docker context.
- **Database:** existing Neon PostgreSQL project, production branch `production`, database `lexa`.
- **AI:** native TypeScript router inside the NestJS API; provider credentials remain in Render's private environment settings.

## Data and migration safety

- Neon PostgreSQL is the system of record.
- Prisma migration directory names are immutable identifiers already recorded in `_prisma_migrations`. Do not rename, reorder, edit, or remove an applied migration. Add a new forward-only migration for schema changes.
- Run `prisma migrate deploy` only through the reviewed deployment process. Do not run `migrate dev` against production.
- Never commit `.env` files, database URLs, provider keys, bootstrap secrets, or backup-encryption keys.
- Frontend `VITE_*` values are public browser configuration, never secrets.

## Validation and operations

- Repository shape: `python3 scripts/validate_repository.py`
- Frontend tests/build: `cd lexa-frontend && npm install && npm run build`
- Backend tests/build: `cd backend && npm install && npm test && npm run build`
- Operational procedures: `docs/operations/runbooks/`

See `docs/quality/release-readiness.md` for the latest inspected deployment state and open release checks.
