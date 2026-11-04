# LEXA source-import CI: frontend TypeScript repair — 4 November 2026

## Evidence and failing release

GitHub Actions workflow **Refresh LEXA from a clean repository ZIP**, run `41772668350`, job `126385736342`, run commit `594c4c446b3f`. The GitHub log confirms:

- Repository ZIP import and source layout validation: PASS.
- Backend: 165 tests PASS; exact OpenAPI route match (365 operations / 295 routes) PASS; backend build step PASS.
- Frontend: 128 Vitest tests across 30 test files PASS.
- Frontend: `tsc -b && vite build` FAILED at `tsc -b`, so Vite was not executed.
- The complete failure log contains **20 TypeScript diagnostics** from `ProcurementWorkspacePage.tsx` and `ProjectsServicePage.tsx`. The GitHub annotations/pasted excerpt showed only part of this set.

## Root causes and changes

### `src/modules/operations/ProcurementWorkspacePage.tsx`

1. Removed three unused type imports (`PurchaseRequest`, `Rfq`, `SupplierQuote`) to satisfy `noUnusedLocals` (`TS6133`).
2. Replaced unsafe `sections[0]` fallback with a separately declared, non-null `defaultSection: PurchasingSection`. With `noUncheckedIndexedAccess`, even `sections[0]` is potentially undefined. Every usage of the selected section now has a guaranteed object (`TS18048`).
3. Replaced nonexistent `workspace.name` with the canonical `workspace.businessName` property from `src/domain/shared/types.ts` (`TS2339`).
4. Imported the existing `minorUnitFactor` utility from the money module, for major/minor currency conversion on supplier credit notes (`TS2304`).

### `src/modules/operations/ProjectsServicePage.tsx`

1. Removed unused icon imports `CalendarClock` and `Wallet` (`TS6133`).
2. Guarded `f.cost`, a `Record<string,string>` index lookup that is `string | undefined` when `noUncheckedIndexedAccess` is enabled (`TS2345`).
3. Guarded `portfolioCurrencies[0]` with the selected workspace currency as a fallback (`TS2345`).
4. Replaced nonexistent `workspace.name` with canonical `workspace.businessName` (`TS2339`).

**Root cause:** The two new workspace components were introduced without performing the strict `tsc -b` step enforced by LEXA's frontend build. Runtime tests and syntax parsing do not catch unused symbols or indexed-access/type-interface errors. These are concrete source repairs, not compiler-setting changes or warning suppression.

## Verification performed on the corrected archive contents

- Executed `python3 backend/scripts/check-openapi-coverage.py`: PASS (365 operations / 295 routes).
- Executed `python3 backend/scripts/check-route-adapter-coverage.py`: PASS (17 backend-backed domain adapters).
- Executed the same source-preparation scripts that frontend CI runs: `scripts/fix_build_origin.py`, `apply_auth_security_ui.mjs`, `complete_modules.py`, and `apply_lexa_palette.py`: PASS. Their application left the two fixed components unchanged.
- Used the global TypeScript 5 parser to parse 237 frontend/backend source files: **0 syntax errors**.
- Verified relative imports: **0 missing source imports**. The generated Prisma client import is provided by `npx prisma generate` in CI and is intentionally absent from the source ZIP.
- Compared original source ZIP to fixed working tree: only the two frontend files changed, plus this audit document.
- Verified resulting ZIP paths, no wrapper, no `.github` folder, no `node_modules`, no lockfiles or nested ZIPs, and no symlinks; archive integrity passes `ZipFile.testzip()`.

## What has not been reverified

The complete `npm ci`, `tsc -b`, Vite bundle, frontend Vitest, Nest build, and authenticated runtime test suite cannot run in the present offline container: no local npm packages are installed and DNS access to `registry.npmjs.org` fails (`EAI_AGAIN`). The prior GitHub run's backend and frontend test results apply to the supplied baseline; this repair changes only the two components and documentation. A **fresh GitHub workflow result is required** before claiming that the source and production builds are green.

The GitHub Actions notice about Node 20 deprecation is emitted by the repository's preserved `.github` workflows that use `actions/checkout@v4` and `actions/setup-node@v4`; `.github` is expressly excluded from the source-import ZIP. It is nonblocking and should be addressed separately by upgrading the workflow actions in the repository after confirming compatible releases.

## Upload instructions

1. Upload only the new ZIP at the **root of the GitHub repository**, using one `Add files via upload` commit; do not extract into the repository.
2. Allow `Refresh LEXA from a clean repository ZIP` to finish. The importer restores source and generates npm lockfiles automatically.
3. Confirm **Test and build backend**, **Test and build frontend**, and **Commit one clean source update** all complete successfully before promoting any deployment.
4. If another error appears, capture the full GitHub job log, not only the first annotations. Do not turn off strict TypeScript flags to hide errors.
