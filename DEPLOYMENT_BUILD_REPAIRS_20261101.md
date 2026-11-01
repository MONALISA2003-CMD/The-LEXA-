# LEXA deployment build repair record — 1 November 2026

## Vercel `lexa_review`

Deployment `dpl_AUiD1EnwcYJLNss9p7zPfcpbLvYJ`, commit `e8cff2f10fe7bf785f83fbb3026aef608b6f5218`, failed in `buildStep` with `lint_or_type_error`. The Vercel log shows `npm install` completed and the frontend test run passed **22 files / 97 tests**. The failure occurred at `tsc -b` with:

- `SalesWorkflow.getPaymentReport` missing from the local workflow implementation.
- `setPreviewRows` declared but not used.
- `setReviewNotes` declared but not used.

The source handoff now implements `getPaymentReport`, loads the authenticated preview-row endpoint when an import preview is selected, and binds reviewer notes to an editable, bounded textarea. It also fixes the palette prebuild's independent `/operations` route-coverage failure.

## Render `lexa-backend-api-live`

Latest failed deploy `dep-dbjibr2qphnc73e1vqfg`, commit `e8cff2f10fe7bf785f83fbb3026aef608b6f5218`, failed in Docker step `RUN npm run build` / `nest build`. The latest backend log identified:

- `sha` referenced without declaration in the import preview path.
- `before` property not represented in the inferred mapped-row type.
- ZIP-only branch compared a narrowed `zip` literal to `csv`.
- Restore validation inferred `unknown[]` where `string[]` was required.
- Two implicit-`any` callback parameters in download URL construction.

The source handoff uses the existing SHA-256 `hash` helper, enriches the mapped-row type with the optional before snapshot, stores JSONL ZIP members with a static `.jsonl` name, uses explicit `string` sets for restore schema validation, and types download URL callback parameters. The recurring accounting period mismatch is also corrected to the schema's `startsOn` field.

## Additional latent issues caught while repairing

- `validateMappedRows` returned a widened `string` action due to a conditional literal expression; it now assigns a `MappedImportRow['action']` discriminator before returning.
- The restore dependency graph now handles optional `Map.get` results before mutating sets.
- The palette script's explicit route allowlist now includes `/operations`; its validation now passes.

## Verification limits

Passed: backend 74/74 tests; 175 TypeScript/TSX transpilation syntax checks; isolated strict typecheck of `platform-jobs.ts` and its imported local modules using minimal external API stubs; backup inventory; OpenAPI, adapter and ledger coverage checks; frontend prebuild scripts.

Not verified: full Nest build, full frontend TypeScript/Vite build, rerun of frontend Vitest after the additional report test, Playwright, hosted Vercel build after these changes or hosted Render build after these changes. The workspace has no dependency directories and outbound DNS cannot resolve npm registry hosts. Do not mark the hosted deployment green until Vercel and Render finish new successful builds.
