# LEXA current Vercel and frontend diagnosis

Checked: 29 October 2026 (latest connected Vercel/GitHub metadata available in this session).

## Deployment state

- Latest repository `main` commit: `ad12d0214582a3aa3d78cbdd4d833168848a4e98` (GitHub Actions extracted ZIP archives at 04:42:34 UTC).
- Latest Vercel production build for that commit: deployment `dpl_43PrCQasRV26Cp1NGGTjUWy9E3jk`, state `ERROR`, error code `lint_or_type_error`, build command `npm run build` exited with code 2.
- The preceding extraction commit `9f70a1bb361249230bd37f6b91e5508414884cf7` also failed Vercel.
- Last confirmed successful production deployment is `dpl_Cd5NgbXDfSZoM6KFvjxrjy1xWsDW` on commit `b90b139fcf72fa8bb7576ffebc6a9b9220eab586`.
- The `lexareview.vercel.app` alias still resolves to that successful older deployment. Newer commits have not been promoted to the production alias.
- The deployment metadata endpoint returns status and error codes, but the connected Vercel build-events endpoint returns 404 for these deployment IDs. Therefore exact raw `tsc` diagnostics were not exposed to this session.

## Frontend repository structure

`The-LEXA-` is a React + TypeScript + Vite application under `lexa-frontend/` (about 90 tracked frontend files at the inspected commit):

- `src/app/`: router, application shell, workspace context and providers.
- `src/data/`: core IndexedDB/local repositories, contracts, provider adapters, mock preview data, reporting and Business Tools backup/CSV logic.
- `src/domain/`: shared types, money rules, sales rules and inventory rules.
- `src/modules/`: dashboard, checkout, sales, products/inventory, settings, operational preview workspace and Business Tools screens.
- `src/styles/`: global and LEXA brand styles.
- `src/test/`: Vitest setup.
- `e2e/` and `playwright.config.ts`: separate Playwright end-to-end tests.
- `scripts/complete_modules.py`: build-time source transformation used by `prebuild`.
- `scripts/fix_build_origin.py`: `pretest` repair for Vitest scope and CRM report count.
- `vite.config.ts`, `tsconfig.app.json`, `tsconfig.node.json`: Vite, Vitest and strict TypeScript build configuration.

## Confirmed/strongly evidenced failure origins and patch

The project's `tsconfig.app.json` uses `strict: true`, `noUncheckedIndexedAccess: true` and `exactOptionalPropertyTypes: true`. The current build-time transformer emits unguarded indexed array access in two generated UI locations:

1. `current[0]` in the one-payment auto-fill callback, where TypeScript treats the element as possibly undefined.
2. `navSections[0].items` when constructing Simple navigation, where the first section is not guaranteed by the declared array type.

The new Business Tools CSV/backup source also used several first-row/first-record accesses without narrowing (`rows[0]`, `products[0]`, `movements[0]`, and backup table lookup), and a dynamic `row[map.get('trackstock')!]` call dereferenced an array entry without proving that entry exists. These are vulnerable to the same strict compiler setting.

`LEXA_FRONTEND_STRICT_TYPESCRIPT_FIX_20261029.zip` patches the source transformer and Business Tools source:

- safely guards the payment-line entry and Simple navigation first section;
- validates CSV headers and first imported records before dereferencing them;
- centralizes optional CSV field access and avoids direct `.trim()` on possibly absent cells;
- validates backup table lookups before restore; and
- fails clearly on an empty/invalid import instead of throwing through an unsafe first-row dereference.

## Validation boundary

Passed locally in this session: ZIP integrity; Python syntax compilation of the patched transformer; source assertion checks; and a focused TypeScript fixture compiled with `--strict --noUncheckedIndexedAccess --exactOptionalPropertyTypes`.

Not yet passed/verified: the complete repository `npm test`, `npm run typecheck` (`tsc -b`), `vite build`, and a new Vercel build using the patch. The project requires a fresh deployment to establish green. The patch deliberately preserves strict compiler checks rather than suppressing them.
