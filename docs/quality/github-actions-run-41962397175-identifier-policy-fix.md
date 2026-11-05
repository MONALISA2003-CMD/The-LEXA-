# GitHub Actions run 41962397175: TS2345 identifier policy repair

## Observed failure

Run #86, job 127031563086, failed in the backend Nest build at
`backend/src/supply-chain/supply-chain.controller.ts:196`:

`TS2345: Argument of type '"imei"' is not assignable to parameter of type 'never'.`

All 247 preexisting backend tests, the industry contract, the OpenAPI coverage check, the route uniqueness check, and the backup inventory check had passed before this compile failure. The frontend step was skipped.

## Root cause

The generated industry manifest is an `as const` literal. Some product policies have
`identifiers: []` while others have `identifiers: ["imei", "imei2"]` or
`["serial"]`. Indexing the manifest produces a union of literal tuple types.
Calling `policy.identifiers.includes('imei')` on that union caused a parameter
intersection inferred as `never`, even though `"imei"` is a valid identifier capability.

## Repair

- Added `backend/src/catalog/identifier-policy.ts` as a typed, reusable
  boundary that widens the manifest's identifier tuples to `readonly string[]`
  for capability membership checks. Unknown and retired types return `false`.
- Routed both procurement goods-receipt validation and direct inventory
  registration through `productHasIdentifier(productType, 'imei')`, so neither
  path duplicates or casts the generated policy.
- Added `backend/test/industry-identifier-typing.test.mjs`: checks strict TypeScript
  compilation of the helper, verifies both handler paths use it, and asserts
  smartphone/TV/fashion/bakery identifier semantics from the manifest.
- Left migrations, the industry manifest, existing records, and API routes unchanged.

## Local verification

- Reproduced the original `TS2345` with global TypeScript 5.8.3.
- New helper passes TypeScript `--strict --noEmit` against the generated policy.
- Backend suite: **250 passed, 0 failed** (247 existing + 3 new checks).
- OpenAPI: **398 exact operations across 321 routes**.
- Route uniqueness: **421 registrations, no duplicates**.
- Adapter coverage: **17** verified; ledger: **15** workflows; backup inventory:
  **170** table decisions.
- Frontend preparatory generators completed, post-generation TypeScript parsed.
- Source-level TypeScript syntax: **268 files**, no syntax errors; **852**
  relative imports resolved.

## Outstanding release gate

The local container lacks npm registry DNS and project dependencies, so a full
NestJS/Prisma/Vite dependency-backed build, browser E2E, and live database smoke
checks were not run here. CI must finish those steps after uploading this ZIP.

## Safe importer usage

Push exactly one newly added root-level ZIP in one commit on `main`.
Do **not** delete another ZIP in the same commit. Prior runs #84 and #85 failed
because the importer attempted to read a ZIP already deleted in the triggering
commit. The importer deletes the uploaded ZIP itself after safely expanding it.
