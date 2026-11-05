# Electronics device receiving — Vitest accessibility test repair

**Date:** 5 November 2026  
**Failure:** GitHub Actions import run #103 (42008348701), frontend `npm run prebuild` / `vitest run`.

## What failed and why

The `ElectronicsStockOperations.accessibility.test.ts` test read its neighboring TSX source using `readFileSync(new URL('./ElectronicsStockOperations.tsx', import.meta.url), 'utf8')`. Under Vitest's Vite/JSDOM transform, this literal asset-URL pattern can be rewritten into a browser/web asset URL, not a `file:` URL. Node's `readFileSync` refuses that scheme, and the test suite fails during module initialization before any assertions run.

This is a **test harness failure**, not an inventory stock-posting error. The backend and other 33 frontend suites passed in the failed run; the `tsc -b && vite build` step did not execute.

## Correction

- The test resolves the actual committed TSX source using `resolve(process.cwd(), 'src/modules/products/ElectronicsStockOperations.tsx')`, matching the working file-read pattern in the existing `src/styles/lexa-brand.test.ts`.
- The accessibility/security assertions remain intact: unposted drafts, explicit posting, screen-reader status and alerts, removable individual drafts, and no persistent local storage of device IMEIs.
- A source scan confirms there are no other tests combining a filesystem read with `new URL(..., import.meta.url)`.
- This release changes no database migrations, stock transactions, frontend business interactions, package versions or product identifiers.

## Verification

- Exact failing source-load and existing accessibility assertions: **passed locally** using Node from the frontend project working directory.
- Full backend regression suite: **301/301 passed**.
- Industry and electronics catalogue generators: **passed**.
- OpenAPI operation coverage: **442** operations across **355** routes, passed.
- Route uniqueness: **465** registrations across **29** controllers, passed.
- Backup inventory coverage: **185** table decisions, passed.
- All frontend tests checked for the vulnerable file URL pattern: **none remain**.
- TypeScript/TSX syntax validation and ZIP importer integrity: recorded in the release handoff.

### Required remaining release gate

GitHub Actions must install frontend dependencies, execute the **34 Vitest suites**, then execute `tsc -b && vite build`, and commit the imported source. Because this sandbox has no npm registry resolution and no frontend dependencies installed, a complete frontend Vitest or Vite build cannot be certified locally. A green GitHub run and staging verification of prior migrations are required before asserting the new electronics inventory is deployed.

## Release instructions

Upload this single clean source ZIP as **one new root ZIP** on `main` and do **not** delete or rename an older root ZIP in the same commit. The existing `.github` import workflow is intentionally excluded from the source ZIP and preserved by the importer.
