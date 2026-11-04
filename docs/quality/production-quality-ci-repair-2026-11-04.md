# LEXA — Production & Quality TypeScript CI Repair

Date: 2026-11-04 (Africa/Kampala)
Affected workflow: `Refresh LEXA from a clean repository ZIP`, GitHub Actions run `41780185984` (upload #55), job `126409702820`.

## Confirmed failure

The ZIP imported cleanly. Backend tests, contract coverage, and frontend unit tests passed on the GitHub runner. The frontend failed at `tsc -b` before Vite could bundle. The unabridged job logs report **17 TypeScript errors** in `src/modules/operations/ProductionQualityPage.tsx`, including more diagnostics than the abbreviated GitHub annotations:

- `TS6133` (2): unused `InspectionPlan` and `formatMinorAmount` imports.
- `TS2322` / `TS2345` (9): form values read from `Record<string,string>` may be missing (`string | undefined`) under `noUncheckedIndexedAccess`. They affected the BOM, work-order, plan, inspection, and completion requests.
- `TS2379` (3): request payloads provided `undefined` for optional API properties, incompatible with `exactOptionalPropertyTypes`; these affected inspection decisions, finished-output processing, and job-step completion.
- One additional `TS2322` involved optional operation names in BOM component lines, and related diagnostics arose from the same two design problems. See the complete GitHub job log for compiler line/column details.

## Root-cause repair

A new `src/modules/operations/productionQualityForms.ts` establishes a single typed boundary for all seven purchasing/manufacturing-related production form payloads. It:

1. Validates mandatory product, BOM, warehouse, plan, and order fields before submitting.
2. Validates positive quantities to at most three decimal places, component scrap percentages, numeric quality thresholds, and nonnegative whole-minute job times.
3. Omits blank optional fields instead of sending explicit `undefined`.
4. Checks for duplicate finished-product serial numbers and invalid inspection values.
5. Uses the **exact existing API method body types** (inferred with `Parameters<typeof apiProductionQuality.method>`), retaining strict API compatibility without non-null assertions or disabling compiler checks.

`ProductionQualityPage.tsx` now delegates payload construction and validation to these functions and no longer imports unused types/utilities. `productionQualityForms.test.ts` adds eight unit tests for these failure paths.

## Local validation completed

- Strict isolated `tsc --noEmit`: **PASSED**, using global TypeScript 5.8.3 and `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noUnusedLocals`, and `noUnusedParameters`. The API's original TypeScript method signatures were used. A temporary ambient `import.meta.env` declaration was used only for local validation and is **not shipped**.
- JavaScript runtime smoke assertions against the transpiled production payload helper: **15 passed**. All **8 newly written test cases also executed successfully** in an offline, Vitest-compatible assertion harness; the actual Vitest runner still requires CI dependencies.
- Frontend source-generation scripts (`apply_auth_security_ui`, `complete_modules`, `apply_lexa_palette`, `fix_build_origin`): **passed**, and did **not** overwrite the repaired production form source.
- Full project source-import layout: **passed** using `scripts/check_repository_layout.py`.
- Backend `npm test`: **168 passed, 0 failed**.
- Backend `npm run contract:check`: **367 active operations on 296 routes**, exact OpenAPI coverage; **17 backend domain adapters**, passed.
- Backend `npm run backup:inventory-check`: **passed**.
- User's preceding GitHub run: **128 existing frontend tests passed**. The eight newly added Vitest tests require the new GitHub runner to confirm.

## Release limitation

This execution environment could not reach `registry.npmjs.org` (`EAI_AGAIN`), so `npm ci`, the full frontend Vitest suite, `tsc -b` on the entire React application, and Vite bundling could **not** be executed locally. Syntax-only parsing is not presented as proof of the full frontend build. The repository import workflow regenerates npm lockfiles after extraction, so lockfiles are intentionally excluded from this upload ZIP.

## Upload and verification

1. Upload exactly one new root-level `.zip` file containing canonical `backend`, `lexa-frontend`, `docs`, `scripts`, and approved root configuration files; do **not** include a wrapper directory or `.github`.
2. Commit only that newly uploaded ZIP to GitHub `main`. Do not remove an earlier ZIP in the same commit, since the workflow expects exactly one changed root-level ZIP.
3. Allow the importer to regenerate dependency lockfiles, run 168+ backend tests and 136+ frontend tests, execute OpenAPI coverage, and perform the real `tsc -b && vite build`.
4. Inspect the new run's full logs; do not approve production as error-free until all checks, authenticated endpoints, and deployment health pass.

No live business data, Neon rows, Render services, or Vercel deployments were modified in preparing this repair.
