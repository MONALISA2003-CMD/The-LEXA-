# LEXA Electronics Catalogue: browser API type and stock-tracking repair

**Incident:** GitHub Actions refresh #98, run `41994405457`, 2026-11-05.  
**Affected module:** Electronics catalogue model/category directory in the React frontend.  
**Data/migration changes:** None. Existing tenant, category, product, IMEI, serial, warehouse, movement and financial records remain unchanged by this patch.

## Failed CI gate and root cause

The import and backend job completed, and all 31 frontend test files (139 tests) passed, but `npm run build` failed in TypeScript:

```
src/modules/products/ElectronicsCatalogueDirectory.tsx(79,139):
TS2339: Property 'identifiers' does not exist on type 'V2Family'.
```

The canonical electronics policy already includes `identifiers` and `variantAxes`; the authenticated backend `/catalog/v2/families` response spreads every generated family, including `identifiers`. The frontend's locally hand-written `V2Family` declaration omitted those fields. Its partial type was not linked to the generated contract, so earlier source parsing and tests never detected the missing property.

The directory also treated `identifiers: []` as if the stock policy were always `quantity`, which could mislabel non-stock or batch-tracked families. This was a user-facing semantic error, independent of TypeScript compilation.

## Changes

1. `lexa-frontend/src/domain/catalog/electronicsFamilyTypes.ts`: complete documented `V2Family`/`V2Field` declarations including identifiers, variant axes, review state and the stock profile. Compile-time assertions verify compatibility **and complete field-key coverage** against the generated canonical manifest. Any newly published family property or incompatible field change now fails strict frontend typechecking.
2. `lexa-frontend/src/data/remote/apiElectronicsCatalogue.ts`: imports and re-exports the checked shared types; removes the drift-prone partial local definitions without changing endpoints, request payloads, or runtime behavior.
3. `lexa-frontend/src/domain/catalog/electronicsFamilyTracking.ts`: a single exhaustive rendering rule for serialized stock, quantity stock, batch stock and non-stock items. For feature phones, primary IMEI is identified and IMEI 2 is clearly labelled **only if assigned**; it is never manufactured or mandated for all devices.
4. `lexa-frontend/src/modules/products/ElectronicsCatalogueDirectory.tsx`: uses the checked stock description; no change to category adoption, manufacturer review, brand merging, or customer records.
5. `lexa-frontend/src/domain/catalog/electronicsFamilyTracking.test.ts`: frontend Vitest coverage for feature phones, chargers and every canonical family.
6. `backend/test/electronics-family-browser-contract.test.mjs`: four regression tests run **during backend CI**, ahead of the frontend build. They compile the actual browser type+helper modules using the TypeScript compiler (without React/npm), validate the full generator contract, verify the rendered UI uses the shared policy, and execute the actual tracking formatter against every canonical policy. This prevents a recurrence from being missed by backend-only checks.

## Verification performed locally

- **289 / 289** Node backend tests passed, including four new browser contract tests.
- Standalone strict TypeScript `--noEmit` check of the **actual** new shared type and policy presentation modules passed.
- Electronics/industry generator checks: **282 nodes, 221 leaves, 52 families, 13 industries unchanged**.
- OpenAPI exact match: **428 operations** across **344 routes**; **17** domain adapters.
- Fastify route uniqueness: **451 registrations** across **28 controllers**.
- Backup: **179 decisions**. Ledger: **15 source workflows**.
- Frontend prebuild scripts completed; AST syntax parse of **198 frontend TS/TSX sources** returned zero errors; all relative source imports resolved.
- The release ZIP is verified with `zipfile.testzip()` and the repository import layout rules before delivery.

**Not verified in this environment:** running `npm ci && npm run build` with the entire frontend dependency tree, a real Vite production bundle, fresh GitHub Actions run, production deployment or authenticated customer inventory flows. The environment cannot access the npm registry. Existing CI #98 did run and pass 139 frontend tests **before** this patch; the three additional frontend tests will execute on the next run.

## Separate subsequent importer failure

GitHub Actions run **41995813676** (#99) was also inspected. It never compiled source: its ZIP-import step reported **`The selected archive is not a regular file.`** This is a **separate deleted-or-absent ZIP issue**, not the TypeScript error from #98. The existing import workflow expects exactly **one newly added root-level ZIP in the triggering commit**. It will treat a deleted root ZIP as a changed ZIP and then fail because that path is absent. Do **not** delete an older root ZIP while uploading this replacement.

## Rollout

Upload **one new root ZIP** to `MONALISA2003-CMD/The-LEXA-` `main` in its own commit, without removing another root ZIP in the same commit. Let `repository-import.yml` validate the archive, recover the pinned npm locks from preserved Git history, execute backend tests/generator/Prisma checks and build the full frontend. The release includes **no new SQL migration**.

Verify the run's backend tests, dependency restore, frontend test suite, TypeScript build and Vite build all succeed before asserting production success. Check the deployed electronics directory for feature-phone IMEI labels and accurate quantity-tracked chargers.
