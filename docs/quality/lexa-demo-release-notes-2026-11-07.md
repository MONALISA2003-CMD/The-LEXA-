# LEXA public marketing site and interactive demo — source release

**Release prepared:** 7 November 2026

This package implements the source components for phases 1–5: indexable marketing site, isolated demo API, secure disposable visitor sessions, fictional interconnected workspace seed, normal LEXA business navigation, visitor controls, demo-only backend action restrictions, and per-environment deployment manifests.

## Contents

- `lexa-frontend/marketing/` — independent, public, indexable homepage, feature, pricing, security, and help pages, styles, search metadata and Vercel config.
- `lexa-frontend/src/modules/demo/` — one-click demo entry, temporary-session UI, reset and leave functions.
- `backend/src/demo/` — sandbox-only session lifecycle, strict visitor tenant guard, fictional data seeding and policy.
- `backend/prisma/migrations/20261111100000_isolated_demo_sessions/` — additive demo session schema, RLS policies and bounded cleanup procedures.
- `docs/deployment/vercel.demo.json` — demo app Vercel rewrite configuration, separate from the existing production `lexa-frontend/vercel.json`.
- `docs/deployment/render.demo.yaml` — new **isolated** Render service, separate from the current `render.yaml`.
- `docs/deployment/public-landing-demo-release.md` — detailed setup, security boundaries, release instructions and acceptance tests.

## Validation completed in this environment

- Backend Node test suite: **445 passed, 0 failed** (global TypeScript temporarily linked for tests requiring it, not included in deliverable).
- New demo policy test file: **6 passed, 0 failed**.
- Twelve modified backend/frontend TypeScript files: **syntax transpilation passed**.
- Canonical source ZIP layout check: **pending GitHub importer parity verification**.
- Production database was not changed, and no demo deployment or public domain was switched.

## Important deployment limitations

Full `npm ci`, Prisma client generation, TypeScript typecheck, frontend Vite build, database migration execution, and end-to-end browser testing **were not possible in this container**: npm registry access is unavailable and the source ZIP intentionally omits dependency lockfiles. The existing repository import/CI workflow must restore and validate its committed lockfiles before building. Do not call this release live or production-ready until these steps pass in a GitHub CI and staging environment.

**Do not run the demo API on the production `lexa` database.** Provision a new **empty** `lexa_demo` database in a separate Neon project; never branch from production. Do not put production secrets in demo configuration. Keep production Render and Vercel services unchanged until demo and marketing deployments are validated. Follow the detailed deployment guide before connecting the live domain.

## 7 November 2026 — GitHub Actions #149 archive-import repair

The previous demo export unintentionally included four **unapproved ZIP roots**: `LEXA_DEMO_RELEASE_NOTES.md`, `render.demo.yaml`, `vercel.json`, and `marketing/`. The active GitHub `repository-import.yml` rejects them. Repaired layout: notes at `docs/quality/lexa-demo-release-notes-2026-11-07.md`, demo Render and Vercel configs under `docs/deployment/`, and public website at `lexa-frontend/marketing/`. No application module was removed.

Added `scripts/preflight_import_zip.py`, `scripts/build_source_import_zip.py`, and seven path-validation regression tests. The preflight now reports **all** unacceptable entries rather than failing on just the first. Archive builder uses maximum broadly compatible ZIP deflate and refuses disallowed top-level files; branded PNGs were individually recompressed using lossless optimization and checked to ensure pixel and image metadata equality.

**Additional completed checks:** 445 backend Node tests + 18 Python analytics tests passed, backend API contract checks passed, backend route uniqueness passed, four industry/product-catalogue synchronization checks passed, and 354 TypeScript/TSX files passed syntax-transpilation. Full package install, Nest backend build, frontend typecheck/build, actual database migrations and live web E2E verification are **not** certified in this package and remain GitHub/staging deployment gates.
