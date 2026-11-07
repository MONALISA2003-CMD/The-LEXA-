# LEXA deployment forensics — palette generator drift, 7 November 2026

## Confirmed statuses as inspected
- GitHub import run 42348099770: success, imported commit `e39d49e39515a69b047742c3c92ca8e8ee4d4bdf`.
- GitHub isolated browser workflow 42348247601: success at the same code revision.
- Vercel `lexa_review` deployment `dpl_ETrqEYowNb3HLzVdDCC3yNHsT4N1`: failed in frontend prebuild at `BUSINESS REPORTS & ADVICE route /intelligence should use gold, uses blue`.
- Render `lexa-backend-api-live` deploy `dep-dbnch18473hc739gkvu0`: live at the same revision, finished 2026-11-07 06:45:36 UTC.
- Neon production DB `lexa`: the failed `20261111100000_isolated_demo_sessions` attempt is marked rolled back; the subsequent attempt finished successfully at 2026-11-07 06:45:27 UTC.

## Verified root cause
`lexa-frontend/scripts/apply_lexa_palette.py` regenerates `src/domain/shared/moduleAccents.ts` and previously contained older mappings for `/intelligence` (blue), `/business-tools` (cyan), `/modules/support` (teal) and omitted `/modules/shifts`. The generator also overwrote the maintained `moduleAccents.test.ts`, erasing more comprehensive assertions. The original `prebuild` validated the map **before** running this generator and did not recheck afterward. The GitHub importer could pass and commit the generated stale map, causing the next Vercel checkout to fail immediately. This explains why repeatedly re-uploading an otherwise corrected map failed to provide a lasting fix.

## Source repairs in this ZIP
1. Updated the **generator**, not merely its generated output, to preserve every approved department mapping.
2. Removed automatic rewriting of the maintained `moduleAccents.test.ts`.
3. Added `lexa-frontend/scripts/test_palette_generator.py`, which checks the generated source against the committed file, preserved tests, critical routes, and prebuild order.
4. Updated the frontend `prebuild` to run generation, the generator regression tests, and the **second** palette validation before Vitest, type checking and Vite bundling.
5. Preserved all existing backend migrations and access/security features; no live DB changes or Render service settings were made by the packaging process.

## Verification and release boundaries
- Local checks: 472 backend Node tests and 18 analytics Python tests passed; API contracts (497 operations), route uniqueness (563 registrations), migration syntax guard (57 files), backup inventory and all palette checks passed.
- The frontend's standalone Vercel-root prebuild scripts can be run without the monorepo. Full `npm ci` / dependency-installed frontend build requires GitHub Actions or Vercel and is **not** certified by local syntax checks.
- The deployment is not green until the next Vercel build reports READY. Upload one ZIP only, confirm GitHub source import, E2E and Vercel deployment status, then check `https://lexaaamaal.com` and the signed-in workspace.
- On the existing Render service, the dashboard may still report `autoDeployTrigger: commit` and an empty `healthCheckPath` even though `render.yaml` requests `checksPass` and `/health/ready`; Blueprint changes must be synchronized explicitly. Do not edit production database migration history manually: the verified rollback/retry has already completed.
