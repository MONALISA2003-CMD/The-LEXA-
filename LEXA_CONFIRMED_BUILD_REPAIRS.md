# LEXA: confirmed build-origin repairs

This update combines the existing Phase 5 frontend patch with a repair hook for the failures evidenced in Vercel's 2026-10-29 logs.

## Fixes included

1. **Vitest vs Playwright:** `fix_build_origin.py` adds a Vitest `include` pattern for unit tests under `src/`. Playwright specs under `e2e/` remain runnable via `npm run test:e2e` and are no longer loaded by `vitest run`.
2. **CRM contacts-on-file count:** the master-data coverage report counts all saved contacts, not only contacts falling within the selected reporting period.
3. **Idempotent repair hook:** `package.json` runs the repair script as `pretest`. The existing `prebuild` runs the module transformer and test suite, so the repair executes before Vitest. Running the repair repeatedly is safe.
4. Strict TypeScript checks remain enabled. This package does not disable type checking or suppress compiler errors.

## Validation status

The ZIP integrity, JSON syntax, Python syntax, and the repair hook's idempotent transformations were validated with fixtures. **A complete project build has not been verified in this environment.** The latest Vercel deployment reports `lint_or_type_error` (`npm run build` exit code 2), but the connected log endpoint does not return the compiler diagnostics. This package fixes the two confirmed test failures; it does not claim that unknown type-check diagnostics are already resolved.

After extraction, Vercel must pass the full `prebuild` test run, `tsc -b`, and `vite build`. If `tsc -b` reports additional diagnostics, fix those source locations rather than disabling checks.
