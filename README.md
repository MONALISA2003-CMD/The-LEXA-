# LEXA

LEXA is a multi-tenant business management platform for sales, inventory, finance, procurement, people operations, reporting and administration.

## Repository structure

```text
.
├── backend/                  # NestJS API, Prisma schema, migrations and tests
├── lexa-frontend/            # React + TypeScript + Vite web application
├── docs/                     # Architecture, deployment, security and operations guidance
├── scripts/                  # Repository cleanup, validation and ZIP-import checks
└── render.yaml               # Existing Render API service Blueprint
```

There is one active backend and one active frontend. The AI router runs inside the NestJS API. A worker entry point is retained in the backend package; it is not a separately deployed Render service in the current connected topology. GitHub Actions workflows remain in the GitHub repository under `.github/workflows/`; source-import ZIPs intentionally omit `.github/` because the repository-import workflow rejects that directory. The workflow requirement is recorded in `REPOSITORY_LAYOUT_MANIFEST.json`.

## Production topology — 3 November 2026

- **Frontend:** Vercel project `lexa_review`, root directory `lexa-frontend`, Vite, output `dist`.
- **Backend:** Render service `lexa-backend-api-live`, Docker runtime, `backend/Dockerfile`, repository-root context (`.`), Frankfurt, `main` auto-deploy, one instance, compute plan `1c-2g` (1 vCPU / 2 GB RAM), approximately **$25/month**.
- **Database:** Neon PostgreSQL project `lexa-backend`, PostgreSQL 17, AWS `eu-central-1` (Frankfurt), production branch `production`, database `lexa`.
- **Production endpoint:** minimum 0.5 CU, maximum 2 CU, active, suspend timeout `-1` (always on), connection pooler enabled in transaction mode.

The configuration above reflects the production settings supplied as directly checked on 3 November 2026. `render.yaml` uses Render's supported Blueprint plan value `1c-2g`, not the legacy API `buildPlan` value. The project-level Neon defaults (0.25–8 CU and suspend timeout 0) are not the production endpoint's settings.

See [the current compute and connection guide](docs/deployment/current-compute-configuration.md) for provider identifiers, connection rules, cost estimates, deployment boundaries and release gates.

## Neon connection variables

Use two distinct Neon hostnames:

- `DATABASE_URL`: pooled hostname (contains `-pooler`) for API runtime and tenant-scoped worker query traffic. Login role: `lexa_app`.
- `DATABASE_URL_UNPOOLED`: direct hostname (no `-pooler`) for Prisma CLI operations such as `migrate deploy`, migration status and introspection.

Set `DATABASE_RUNTIME_ROLE=lexa_app_runtime`. The backend applies the runtime role and tenant/user/session settings transaction-locally after beginning an interactive transaction. The production login role `lexa_app` is `BYPASSRLS`; tenant queries must switch to the no-bypass `lexa_app_runtime` role. The worker queue-discovery path still uses the privileged login for narrowly scoped queue/control metadata only and remains a database hardening follow-up. Do not add `options=-c role=...` to either URL; Neon transaction pooling does not support that startup role option. Examples contain placeholders only. Never copy live credentials into this repository.

## Local development

Use Node.js 22 (`.nvmrc`).

**Frontend**

```bash
cd lexa-frontend
npm install
npm run build
```

**Backend**

```bash
cd backend
cp .env.example .env
# Set development-only pooled and direct URLs. Never use production credentials locally.
npm install
npm test
npm run build
```

## Data and migration safety

- Neon PostgreSQL is the system of record.
- Prisma migration directory names are immutable once applied. Do not rename, reorder, edit, remove or reset applied migrations.
- Add schema changes only as reviewed forward migrations. Never run `prisma migrate dev` against production.
- Never commit live `.env` files, database URLs, provider keys, bootstrap secrets or backup-encryption keys.
- Frontend `VITE_*` values are public browser configuration, never secrets.
- Do not run production migrations as part of archive cleanup or validation.

## Validation

- Repository layout and secrets hygiene: `python3 scripts/validate_repository.py`
- Import ZIP structure: `python3 scripts/check_repository_layout.py`
- Backend: `cd backend && npm test && npm run build`
- Frontend: `cd lexa-frontend && npm run build`
- Operations: `docs/operations/runbooks/`
## Clean CI dependency installation

The production release ZIP includes the two matching npm lockfiles and excludes only generated/dependency artifacts. The GitHub repository-import workflow runs `python3 scripts/clean_repository.py` before repository validation and before either `npm ci` command. That preparation step creates a missing `package-lock.json` in each application using `npm install --package-lock-only --ignore-scripts --no-audit --no-fund`, then verifies lockfile format and that the lockfile root exactly matches the corresponding `package.json`. It does not install `node_modules` or execute package lifecycle scripts. If generation fails or a lockfile is stale, the workflow stops before running `npm ci`.

For local clean installs, run `python3 scripts/clean_repository.py` from the repository root before `npm ci` in `backend/` or `lexa-frontend/`.

## Latest operational integration release candidate (2026-11-03)

See [Production integration release and acceptance checklist](docs/operations/production-integration-release-2026-11-03.md) for purchasing, finance, payroll, bank reconciliation and live reporting changes, test results and remaining launch gates.


## November 2026 — CEO workspace, roles, navigation and overview release

This source release retains the single-tenant data model and one internal default
branch for compatibility with existing sales/stock/ledger foreign keys. It removes
all branch and additional-workspace creation from regular LEXA screens.

- Full, permission-filtered, collapsible business categories; all 54 module IDs
  retain their original individual URLs. No **All modules** screen/link, Simple/
  Advanced switch or duplicate Settings item.
- **My Business** unifies owner profile, company identity, authorized team,
  manual recording methods and business privacy.
- **Team & permissions**: role-based invitation, role change, suspension,
  reactivation and owner-only removal from this business. Employees set their
  own password through expiring invitation links; no shared credentials.
- Owner-only business configuration; staff writes require per-capability server
  checks. Staff DELETE, void, clear, unlink, purge and remove actions are denied;
  historical business records are never removed when access is revoked.
- Overview uses actual tenant-scoped sales, receipts, stock movements and
  audited activity; charts refetch every 45 seconds while the page is in use.
  Empty states never fabricate sample totals.
- Database migration `20261103230000_owner_suspended_session_revocation`
  extends RLS narrowly to revoke suspended employees' sessions when authorized
  by the owner in the same tenant, without weakening ordinary session isolation.
- Recovery from stale JS-chunk versions and explicit cache headers for immutable
  assets versus current HTML.

**Release safety:** No payment gateway, no new company tenant, no deletion of
existing business records or branches. The migration must deploy with its matching
backend source; do not apply it to production as a standalone manual edit.

## Bright Executive Blue CEO release — 3 November 2026

The bright executive design polishes Overview, My Business, owner-only team administration, navigation and shared card styles. It preserves verified financial data, tenant isolation, auth, schema and migrations. See `docs/release/bright-executive-ceo-2026-11-03.md`.
