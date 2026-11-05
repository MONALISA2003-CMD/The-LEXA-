# Electronics catalogue frontend: TypeScript build repair

**Date:** 2026-11-05  
**Affected job:** Refresh LEXA from a clean repository ZIP — Add files via upload #107  
**Failure boundary:** `lexa-frontend` production build (`tsc -b && vite build`), after **34/34 frontend Vitest files and 151/151 tests passed** in the reported Actions run.

## Diagnosis

The failing run was not a Vitest failure. The production compiler checks properties and array mutability more strictly than the Vitest transformer.

1. **`electronicsFamilyWizard.ts` — TS2339 (two errors):** the generated `ELECTRONICS_V2_CONTRACT.nodes` is a discriminated literal union. Nonselectable division and group nodes intentionally lack `familyCode`. Accessing `node?.familyCode` does not make that property available across every union member. A structural `'familyCode' in node` guard is required before retrieving a published family.
2. **`AdaptiveProductFields.tsx` — TS2322:** the fallback preset exposes `readonly ProductField[]`, but the component assigned it to mutable `ProductField[]`. The source now treats published fields as immutable and copies them when merging editable category fields.
3. **Additional strictness control:** `V2Field.options` is optional. `options: undefined` is invalid for `ProductField.options?: readonly string[]` when `exactOptionalPropertyTypes` is enabled. `electronicsProductFieldAdapter.ts` omits the property entirely when the published field has no options. This avoids a likely follow-on compiler failure after fixing the readonly error.

## Corrective changes

- `lexa-frontend/src/domain/catalog/electronicsFamilyWizard.ts`: safe family-code detection on the generated discriminated catalogue union.
- `lexa-frontend/src/domain/catalog/electronicsProductFieldAdapter.ts`: strictly typed, immutable published-family-to-product-field mapping and deduplicated category-field composition.
- `lexa-frontend/src/modules/products/AdaptiveProductFields.tsx`: use the typed adapter; accept published preset fields as `readonly`.
- `lexa-frontend/src/domain/catalog/electronicsReceivingValidation.test.ts`: cover nonsellable intermediate categories and valid feature phone, charger, laptop, and refrigerator families.
- `lexa-frontend/src/domain/catalog/electronicsProductFieldAdapter.test.ts`: cover exact optional-property semantics, enum options, immutable field merging, and duplicate custom-field suppression.

The canonical generated electronics catalogue and its migrations were **not** modified. No stock ledger, database, security policy, or deployment configuration was changed.

## Verification performed in source-repair environment

| Check | Result |
| --- | --- |
| Standalone TypeScript compilation of the actual generated wizard and product-field adapter (`--strict --exactOptionalPropertyTypes --noUncheckedIndexedAccess --noUnusedLocals --noUnusedParameters`) | **PASS** |
| Runtime assertions on the generated published catalogue, parent-node handling, seven key wizard/variant cases, and field adaptation | **PASS** |
| Electronics V2 generated policy and migration seed hash comparison | **PASS** — 282 nodes, 221 selectable leaves, 52 published family policies |
| Shared 13-industry catalogue generation | **PASS** |
| Source import ZIP layout and workflow-preservation requirements | **PASS** |
| Build-origin repair fixture | **PASS** |
| Frontend `npm ci`, full `npm run build`, and Vitest after this patch | **NOT RUN** — npm registry DNS is unavailable in the local repair environment. GitHub Actions must verify these with its installed dependencies. |

## GitHub Actions release gate

Import the clean ZIP using the existing repository-refresh workflow. Because this import intentionally excludes `.github/` and package lockfiles, retain the workflow and its lockfile-regeneration/validation procedures in the GitHub checkout. CI must run and pass:

```bash
cd lexa-frontend
npm ci
npm test
npm run build
```

Review the build output for **zero TypeScript errors** before treating this source as production-ready. If CI reports a different failure, capture the full first error and its file/line number; do not disable `strict`, `exactOptionalPropertyTypes`, or `noUncheckedIndexedAccess` to hide it.

The 34-file/151-test result belongs to the *reported failing run before this repair*, not a newly completed CI run. The additional tests introduced here have not yet been executed under Vitest in this environment.
