**Navigation and wording release (7 Nov 2026):** The sidebar uses one midnight-blue identity in light and dark themes while business-area pages retain their assigned colors. The mobile drawer is keyboard-accessible and responsive from 320px upward. See [release verification and rollout](docs/release/LEXA_MIDNIGHT_NAVIGATION_RELEASE_2026-11-07.md).

**Production migration recovery (7 Nov 2026):** See [`docs/release/LEXA_RENDER_P3009_AND_PIPELINE_RECOVERY_2026-11-07.md`](docs/release/LEXA_RENDER_P3009_AND_PIPELINE_RECOVERY_2026-11-07.md) for the verified Prisma P3009 incident, guarded retry, and Render CI deploy filters.

**New: public LEXA landing website and isolated interactive demo (source release):** [Demo release notes](docs/quality/lexa-demo-release-notes-2026-11-07.md) and [separate-deployment runbook](docs/deployment/public-landing-demo-release.md). These are not yet deployed; the demo must use a new empty database, never the production customer database.

**New: Private five-seat administrator setup (no Neon SQL, no customer account):** [Simple setup runbook](docs/operations/runbooks/private-platform-administrators-five-seat-setup.md).

# LEXA

LEXA is a multi-tenant business management platform for sales, inventory, finance, procurement, people operations, reporting and administration.

## Latest 13-industry security and recovery gates

The shared industry product policy, restricted technician role, guarded CSV apply, and catalogue restore-integrity audit are versioned with the backend/frontend source. See [the 13-industry release-gate runbook](docs/operations/runbooks/industry-13-release-gates.md). **Source checks do not certify live business journeys**; run staging migrations, full production-like authentication, and all 13 end-to-end acceptance scenarios before declaring industry readiness.

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

The repository source-import ZIP deliberately omits the npm lockfiles; its GitHub importer restores the previously verified committed lockfiles and normalizes safe dependency removals before installing. A full repository checkout must contain both matching lockfiles. The GitHub repository-import workflow runs `python3 scripts/clean_repository.py` before repository validation and before either `npm ci` command. That preparation step creates a missing `package-lock.json` in each application using `npm install --package-lock-only --ignore-scripts --no-audit --no-fund`, then verifies lockfile format and that the lockfile root exactly matches the corresponding `package.json`. It does not install `node_modules` or execute package lifecycle scripts. If generation fails or a lockfile is stale, the workflow stops before running `npm ci`.

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

## CEO business control and staff onboarding (November 2026 release)

The verified business membership role `owner` is displayed as CEO / Owner and
retains all tenant-scoped operation privileges for existing and new owners.
New public signup creates exactly one business. API-managed additional business
creation is blocked for members, and user-created branches are disabled.
Internal Main accounting locations are retained for existing foreign keys.

Business Profile Setup now keeps owner authorization separate from profile
network failures and scopes profile reads/writes to the signed-in tenant and CEO.
My Business offers an explicit retry on profile failures.

CEO-only Team & Permissions supports employee biodata, job details, username-only
accounts when work email is unavailable, job-role assignment, temporary passwords
with mandatory change on first sign-in, account suspension, profile edits and
audited password resets that revoke existing staff sessions. Employee roles have
curated navigation and a limited personal employment summary.
Sensitive employee fields are tenant-scoped with forced PostgreSQL RLS.
Compensation and statutory payroll continue to use the existing HR/Payroll
workflows; approval limits require separate domain-specific enforcement.
All migration changes are forward-only; do not run SQL manually in production
before the matching backend release.

## November 2026 inventory identity hotfix (Phase B1)

This source package corrects a strict frontend TypeScript build error in
`AdaptiveProductFields.tsx` (`TS2339` on optional category fields) without
weakening compiler rules. It also adds physical-unit identity enforcement:

- IMEI check-digit validation in the two backend serial-registration endpoints.
- PostgreSQL trigger preventing new cross-slot duplicate primary serial/IMEI
  and secondary IMEI values across all branches of the same business.
- Corrected lot-capacity trigger so serial-tracked devices can be registered
  without a lot when product policy permits it.
- An authenticated, branch-scoped serial/IMEI lookup for all API clients.
- POS scanning of the exact physical unit, with second IMEI display; stock
  availability and final sale commitment remain server-validated.
- Whole-unit validation when receiving serialized stock into a lot.

Runbook: `docs/operations/runbooks/serial-identity-enforcement.md`.
This is **source prepared for CI**, not confirmation of an applied production
migration or a verified complete frontend build. The existing 13-industry
manifest remains canonical and no customer data is removed.

## Electronics Catalogue V2 — taxonomy and directory (read-safe)

This source release adds versioned electronics taxonomy/policy contracts while preserving
all 13 industries and historical product/stock identities. See
`docs/quality/electronics-catalogue-v2-release.md` for the staging migration,
role/tenant checks, safe category adoption, source parity and rollback gates.

Preview a feature-phone category without changing business data:

```bash
python3 scripts/sync_electronics_catalogue_v2.py --check
python3 scripts/plan_electronics_v2_import.py --codes ELEC.MOB.FEATURE.GSM
```

New owner-authorized changes are visible under Products > Electronics V2 directory
only once the database migration, backend and frontend have been deployed.

## Account security and privacy (November 2026)

The account-protection source now includes Cloudflare Turnstile verification for sign-in and public registration, server-issued new-browser verification, authenticator TOTP and recovery codes, account-owned trusted browsers, session revocation, append-only account security history, and user privacy preferences. Public Cookie and Privacy Policy pages are available, along with self-service account security and privacy screens for owners and employees.

**Do not deploy the backend ahead of its additive account-security Prisma migration.** Production sign-in enforcement requires matching Cloudflare keys, exact hostnames, OTP/TOTP secret configuration, and working email delivery. All keys remain server-side. See `docs/operations/runbooks/account-security-and-privacy.md` and `docs/quality/account-security-and-privacy-implementation.md` for test gates, operational recovery, limitations and evidence. This source package has not been deployed or fully authenticated in production.

## Background worker and release hardening (6 November 2026)

The platform worker is a separate, opt-in, **paid Render background service**. It
is not started by the existing API Dockerfile. Its guarded configuration and
multi-tenant worker regression tests are in:

- `backend/src/platform/worker-config.ts`
- `backend/test/worker-release-hardening.test.mjs`
- `docs/deployment/render-worker.yaml` (standalone Blueprint, **not** the API Blueprint)
- `docs/deployment/WORKER_RELEASE_CHECKLIST.md`
- `docs/operations/runbooks/LEXA_RELEASE_SQL_AUDIT.sql`

**Do not enable the worker or upgrade the existing Free Redis instance until the
maintenance plan and private scanner, durable Redis, storage and credentials are
verified.** The worker requires both `LEXA_WORKER_ENABLED=true` and
`LEXA_WORKER_DURABLE_REDIS_CONFIRMED=true`, and refuses startup with incomplete
configuration. It never silently marks unscanned uploads safe.

The local-only Playwright navigation smoke test is updated for the approved
Simple/Advanced navigation (the legacy `/modules` directory remains redirected).
GitHub workflow changes are deliberately **not** inside this source ZIP; the
repository-import workflow preserves `.github` independently.

## LEXA Control Centre — manual UGX 50,000 subscriptions (November 2026)

The proposed `/platform-admin` console manages new account approvals, subscription periods, payment claims, business/user directory, subscription revenue, support and evidence-based service health. New verified users enter a payment-pending state; original businesses retain `legacy` operational access until separately authorized transition. The existing `/lexa` marketing page displays UGX 50,000 for 30 days. No demo account or paid infrastructure is created.

**Do not deploy this source without its additive migration, security/RLS review, admin enrollment and GitHub CI.** See `docs/operations/runbooks/platform-control-centre-manual-subscriptions.md` and `docs/quality/platform-control-centre-implementation-audit-2026-11-06.md`. Real payment verification remains an explicit authorized administrative decision; screenshots or customer messages never self-approve.

## Source ZIP imports — prevent Actions #149 root-layout failures

Only `backend/`, `lexa-frontend/`, `docs/`, `scripts/` and the explicitly approved root files may appear in the source ZIP. Marketing source is at `lexa-frontend/marketing/`; demo service settings are at `docs/deployment/`; release notes are at `docs/quality/`. **Do not add root-level `marketing/`, `vercel.json`, `render.demo.yaml` or a free-form release-notes Markdown file.**

Build the import archive outside the repository root, then verify it before uploading it as exactly one new root-level `.zip` to GitHub:

```bash
python3 scripts/check_repository_layout.py
python3 scripts/build_source_import_zip.py /tmp/LEXA_Import.zip
python3 scripts/preflight_import_zip.py /tmp/LEXA_Import.zip
```

Full repair details and post-import CI acceptance checks: `docs/deployment/public-landing-demo-release.md`.
