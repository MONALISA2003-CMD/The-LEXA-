# LEXA

LEXA is a business management platform for sales, inventory, finance, people, reporting and day-to-day operations.

## Repository layout

| Location | Purpose |
|---|---|
| `backend/` | NestJS API, database schema, migrations and automated tests |
| `lexa-frontend/` | Vite/React web application |
| `services/intelligence/` | Optional AI and document-intelligence components; the current live assistant is routed by the backend |
| `docs/` | Architecture, deployment guidance, handoffs, history and validation records |
| `deploy/` | Operational deployment and recovery material |
| `scripts/` | Repository checks and source-maintenance utilities |
| `.github/workflows/` | Automated validation and repository maintenance |
| `render.yaml` | Configuration for the existing Render API service |

There is one canonical frontend and one canonical backend. Do not copy the repository into a child directory or commit downloaded source archives into the repository.

## Local development

**Frontend**

```bash
cd lexa-frontend
npm install
npm run dev
```

**Backend**

```bash
cd backend
npm install
npm run start:dev
```

The frontend production build is `npm run build` from `lexa-frontend/`. The backend Docker build uses `backend/Dockerfile` with the repository root as its build context.

## Deployment settings

- **Vercel frontend root directory:** `lexa-frontend`
- **Vercel framework:** Vite
- **Frontend build command:** `npm run build`
- **Frontend output directory:** `dist`
- **Render service:** `lexa-backend-api-live`
- **Render Dockerfile:** `backend/Dockerfile`
- **Render Docker context:** repository root

Provider credentials remain in private service environment settings. Never commit `.env` files or provider secrets.

## Project documentation

- Architecture: `docs/architecture/`
- Deployment and provider configuration: `docs/deployment/`
- Operational handoffs: `docs/handoffs/`
- Historical implementation records: `docs/history/`
- Validation records: `docs/validation/`
- Frontend research and reference notes: `docs/frontend/`
