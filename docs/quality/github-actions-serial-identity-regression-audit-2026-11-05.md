# GitHub Actions: serial identity regression repair and CI audit

**Date:** 2026-11-05  
**Repository:** MONALISA2003-CMD/The-LEXA-  
**Run:** https://github.com/MONALISA2003-CMD/The-LEXA-/actions/runs/42019330555/job/127217846726  
**Scope:** Clean repository import, backend regression, source contracts, frontend catalogue type safety, and high-risk electronics stock rules.

## Confirmed cause of this failed run

The GitHub Actions connector returned the complete job logs. In the `Validate, replace and verify the source tree` job, the initial source import and canonical repository-layout steps passed. The `Test and build backend` step failed; `Test and build frontend` and the commit step were skipped.

The backend reported **308 passed, 1 failed, 309 total**. The single failure was:

> `backend/test/serial-identity-enforcement.test.mjs`: "web client displays both IMEIs and category field requirements with strict type enabled". The assertion required the literal source declaration `const fields:ProductField[]`.

A previous TypeScript fix correctly replaced that mutable declaration with `mergeProductFields(coreFields, customFields)` to handle read-only catalogue definitions with `exactOptionalPropertyTypes` enabled. The test was asserting obsolete implementation text, not a broken serial/IMEI operation.

## Repair

Edited only `backend/test/serial-identity-enforcement.test.mjs` in the application source tree:

1. Replaced brittle assertions on exact TypeScript variable declarations with a check that the product form calls the shared field merger and binds the rendered input's required attribute.
2. Kept checks for primary and secondary IMEI handling in the frontend/API and exact-unit lookup.
3. Added a runtime regression that imports the real published smartphone policy and field adapter; verifies that `model` remains required, optional choice properties are omitted, 2G–5G selections are intact, and category overrides cannot duplicate or weaken the published model field. The test freezes immutable inputs to catch attempted mutation.

No product or inventory rules, database migrations, API contracts, frontend components, or dependencies were changed for this repair. Existing Phase 2–4 work is preserved.

## Local verification performed

| Check | Result | Scope |
| --- | --- | --- |
| `cd backend && npm test` | **PASS: 310/310** | Node v22.16; global TypeScript package linked locally because npm registry DNS unavailable |
| Post-frontend-source-generation `npm test` | **PASS: 310/310** | Same full backend tests after four frontend source/guard scripts |
| `cd backend && npm run contract:check` | **PASS** | 13 industries, 282 catalogue nodes, 221 selectable leaves, 52 family policies; 442 OpenAPI operations; 17 API adapters |
| `cd backend && npm run ledger:coverage` | **PASS** | 15 workflows |
| `cd backend && npm run backup:inventory-check` | **PASS** | 185 table decisions |
| `cd backend && node scripts/check-route-uniqueness.mjs` | **PASS** | 465 routes across 29 controllers |
| Frontend catalogue + wizard isolated strict `tsc --noEmit` | **PASS** | `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `strict` |
| Frontend `.ts`/`.tsx` parse check | **PASS** | 205 files, 0 syntax errors |
| Frontend build-preparation scripts | **PASS** | Auth safeguards, module completion, palette, build-origin guard; idempotent |
| GitHub ZIP import/layout rules | **PASS by structure** | Clean root-level ZIP; no `.github`, `node_modules` or lockfiles; previous job's import and layout steps had passed |

### Verification limitations

- **No fresh GitHub Actions run has been executed with this repaired ZIP.** Green remote CI status is not yet confirmed.
- **Full frontend `npm test` and `npm run build` are not locally verified.** `npm ping` to registry.npmjs.org failed with `EAI_AGAIN`, and the ZIP intentionally excludes node_modules. Isolated strict TypeScript checks and syntax parsing cannot replace a complete Vite build.
- **No PostgreSQL-backed or browser end-to-end suite was run.** Tenant RLS, warehouse concurrency, fixture migration, physical-device collisions and inventory reconciliation require staging database verification before production approval.
- Backend tests include both runtime checks and structural contract assertions. Passing them does not prove every Phase 2–4 acceptance scenario works under concurrent live workloads.

## Phase 2–4 risk-boundary review

The verified backend regression suite contains tests for published family fields, invalid variant combinations, SKU/barcode/GTIN checks and atomic bulk variant APIs; serial/IMEI cardinality and cross-position collision rules; denied phantom opening stock; quarantine and branch restriction guards; verified electrical fitment and branch-stock recommendations; package conversions; and all-or-none kit consumption. These are meaningful automated safeguards, **not** substitutes for a live database/Point of Sale acceptance run.

### Required staging release gate

1. Import this updated root-level ZIP using the same existing GitHub refresh workflow. Confirm that **both** backend and frontend CI steps complete, followed by the commit step; do not infer green from 310 local tests alone.
2. Run `cd lexa-frontend && npm test && npm run build` using the workflow-installed dependencies. Run Playwright tests in an eligible browser environment.
3. Apply migrations to an isolated staging database. Test ten one-IMEI devices as ten stock units; two IMEIs on one handset as one stock unit; duplicate IMEI and wrong-branch/variant rejection; concurrent idempotent receipt; package receipt of 20 cartons x 10 units followed by 35 unit sales; verified case-only recommendation; unsafe charger suppression; and concurrent bundle consumption.
4. Review count/ledger reconciliation, tenant/branch RLS, and quarantine approval before production deployment.

## Packaging notes

The source ZIP is intentionally root-level, with `backend/`, `lexa-frontend/`, `docs/`, `scripts/`, and canonical files. Existing `.github/workflows/backend-ci.yml` must remain in GitHub; the importer forbids workflow files inside the ZIP. Do not manually delete or replace GitHub's existing lockfiles.
