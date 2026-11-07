# LEXA GitHub Actions forensic repair — 7 November 2026

## Evidence from GitHub Actions

- Run 42327565594 / job 128266287121: ZIP import **passed**. Source layout **passed**. All 445 previous backend tests **passed**. OpenAPI 496 operations and 401 routes **passed**. Route-adapter coverage **passed**. Backend build stopped at `Backup inventory missing tables: demo_sessions`. The frontend job was consequently **skipped**.
- Run 42327523382: failed before import with `The selected archive is not a regular file`. Source workflow checks out the moving `main` ref while looking for a ZIP from the event's older commit. Concurrent / successive imports can remove the event ZIP from the checked-out tree.
- Earlier run 42325760702: source ZIP contained unsupported root-level content; the structural preflight fixed in the previous package prevented recurrence.
- Non-blocking workflow notice: `actions/checkout@v4` and `actions/setup-node@v4` are using the deprecated Node 20 action runtime, forced to Node 24 by GitHub.
- Non-blocking test warnings: `MODULE_TYPELESS_PACKAGE_JSON`; converting the NestJS backend wholesale to ESM just to silence this warning is unsafe without a deliberate module migration.

## Source repairs included in this ZIP

1. `demo_sessions` is explicitly listed in `backend/backup/authoritative-inventory.json` as **excluded**. It contains temporary visitor fingerprints, session token hashes and expiry state, not business history; restoring it could revive sessions.
2. ZIP preflight now compares migration and Prisma schema table names against the backup inventory before upload. The old ZIP now fails *locally* with exactly the missing `demo_sessions` diagnosis.
3. A missing `scripts/build_demo_vercel_bundle.py` is implemented. Unlike the former documentation-only reference, it forces a fresh Vite build with `VITE_LEXA_DEMO=true`, `VITE_DATA_PROVIDER=api`, `VITE_API_BASE_URL=/api/v1`, requires a demo Turnstile site key, and verifies the demo API-only Vercel rewrite file and site `noindex` headers. It cannot recycle an earlier production `dist` build.
4. Regression tests assert backup classification, demo bundle-builder presence, and ZIP preflight detection of the missing table / missing build script.

## GitHub workflow patch — separate manual change

The source-import ZIP cannot include `.github/`. Therefore, to fix the moving-branch race and deprecated Actions runtime, apply the separate downloadable file **LEXA_GitHub_Actions_Workflow_Race_And_Warnings_Fix.patch** to `.github/workflows/repository-import.yml` in the actual GitHub repository. It changes checkout from `main` to the event SHA, fails clearly for superseded uploads, upgrades checkout/setup-node to v5 and disables automatic npm cache.

The patch must be reviewed and applied through GitHub with write permissions; **uploading the source ZIP alone does not update workflow code**. Do not overlap ZIP uploads before the current workflow finishes.

## Audit scope and outstanding gates

- The archive can be checked for integrity, root paths, Prisma-table backup inventory, route uniqueness, catalogue contracts, API contract coverage and TypeScript **syntax** locally.
- npm dependency installations and full NestJS/React **typechecked** builds require real dependency graphs (`npm ci`). This current workspace does not have registry access or previously committed lockfiles; the latest GitHub run proves the unmodified backend test/Prisma stages passed, not that the new upload has completed all stages.
- Real demo provisioning, migration, RLS permissions, cleanup, Turnstile, and cross-tenant browser tests require a **separate non-production `lexa_demo` database and deployment**; they must pass before exposing the public demo.
- The demo visitor IP rate limiter must be tested behind Render's reverse proxy with a strictly verified `LEXA_TRUSTED_PROXY_CIDRS` configuration; trusting arbitrary `X-Forwarded-For` is not safe, and an untrusted proxy address can make different visitors share one rate bucket.
- No production subscription, customer, or payment records should be altered by this source repair.

## Upload procedure

1. Upload **one** newly built root-level source ZIP (not extracted) to the GitHub repository. Keep the current workflow until it completes.
2. Check `Refresh LEXA from a clean repository ZIP`: import, cleanup, Prisma, 447+ backend tests (including the two new assertions), OpenAPI, route uniqueness, backup inventory, Nest build, frontend tests/build, and commit.
3. Apply the separate workflow patch in GitHub to eliminate the ZIP race and obsolete Node-action versions; check the next workflow after that change.
4. Deploy demo infrastructure **only after** the green source CI run and sandbox staging acceptance tests. Production remains unchanged.
