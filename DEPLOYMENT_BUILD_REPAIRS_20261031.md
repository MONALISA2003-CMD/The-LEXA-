# LEXA deployment build repairs — 31 October 2026

This incremental repair addresses the compiler failures shown in the 31 October Vercel and Render build logs. It is a source overlay; it does not deploy, push to GitHub, or change a database.

## Root causes and fixes

### Vercel frontend

1. `lexa-frontend/src/modules/operations/TeamAccessPanel.tsx` imported `Building2` but never rendered it. The frontend TypeScript configuration enables `noUnusedLocals`, so the unused import was a hard build error. The unused import is removed.
2. The all-branches checkbox updater read `current[member.userId]` twice. With `noUncheckedIndexedAccess`, the second indexed read is not guaranteed to be defined even after checking the first optional read. The updater now captures the optional value in `existingDraft` once and uses that narrowed value. This preserves the existing behavior: toggling all branches clears explicit branch IDs; turning it off restores the current draft selection or defaults to all currently available branches.

### Render backend

1. `randomUUID()` is typed by the Node declarations as a UUID template-literal type. The journal creation code later assigns a database-returned `String(...)` value, which is an ordinary string. The local variable is now explicitly declared as `string`, matching the actual database/API value domain.
2. The account lookup used an untyped `any[]` raw-query result, so `accounts.map()` had an implicit-`any` callback parameter under `noImplicitAny`. The query now declares the row shape (`id` and `system_key`) and the map has explicit string key/value types.

These changes repair the four compiler diagnostics shown in the supplied logs; they do not mask or disable strict TypeScript checks.

## Evidence and verification status

- The supplied Vercel log shows the prebuild scripts completed and **22 test files / 96 tests passed** before TypeScript failed. Those are the cloud-run results provided with this repair request; they were not rerun locally because dependency installation timed out in this environment.
- Local backend authorization policy tests: **12/12 passed**. The policy file was compiled independently with the globally available TypeScript compiler before running the test suite.
- Local OpenAPI coverage check: **115 operations across 93 routes passed**.
- Local ledger workflow coverage: **9 source workflows and stated invariants passed**.
- Local syntax-only transpilation: **128 TypeScript/TSX source files, 0 syntax diagnostics**.
- Full dependency-backed `npm run build`, frontend `npm run typecheck` / `npm run build`, Prisma validation/generation and a fresh production-equivalent Docker build were **not run locally**. `npm install` timed out before installing dependencies. The full strict compiler/build gates must still be run by Vercel/Render or in an environment with dependencies installed.

## Files changed by this repair

- `lexa-frontend/src/modules/operations/TeamAccessPanel.tsx`
- `backend/src/general-ledger/general-ledger.controller.ts`
- `backend/src/general-ledger/ledger-posting.ts`
- `WORKSTREAMS_0_3_IMPLEMENTATION_NOTES.md` (this repair is recorded there)

## Apply

Extract `LEXA_Workstreams_0_3_Audit_Implementation_Overlay.zip` at the root of the matching repository checkout. This refreshed ZIP includes these build repairs and the subsequent Workstreams 0–3 audit changes. Review the local diff, then run the frontend and backend build commands. Do not apply migrations to production as part of this source repair; this ZIP contains the previously prepared Workstreams 0–3 overlay as well as these three build fixes.
