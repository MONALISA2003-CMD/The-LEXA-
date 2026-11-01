# LEXA Workstream 6 — Render and Vercel build repair

Date: 31 October 2026  
Source commit diagnosed: `dc67cd70420b63691676cc2fcac928f395bac7b9`

## Deployment diagnosis

Both failures came from the same source commit after the repository ZIP extraction workflow ran. They were separate TypeScript compile failures, not database or infrastructure failures.

### Render backend build

Render reached the backend Docker build stage and ran `npm run build` (`nest build`). Prisma client generation had completed; the image build stopped during TypeScript compilation, before the runtime image could start. The compiler reported:

1. `core.controller.ts`: the approval decision lookup selected only `branchId` but then read `row.data`. Prisma correctly inferred a row containing only `{ branchId }`, so each access to `row.data` failed type checking.
2. `module-graph.controller.ts`: `ForbiddenException` was used for denied module scope but was absent from the `@nestjs/common` imports.
3. `people-projects.controller.ts`: the support-case status was inferred from an `any` SQL row, leaving the regular-expression replacement callback argument implicitly `any` under the backend strict TypeScript settings.

Repairs:

- The approval lookup now selects both `branchId` and `data`, matching the fields actually consumed by the decision handler.
- `ForbiddenException` is imported from `@nestjs/common`.
- The support-case next status is normalized to an explicit `string`, and the formatting callback parameter is explicitly typed as `string`.

### Vercel frontend build

Vercel completed dependency installation, the prebuild scripts, and all 97 frontend unit tests (22 test files). It then ran `tsc -b && vite build`; the TypeScript check stopped the build before Vite production bundling.

The diagnostics were:

1. `PeopleProjectsPage.tsx`: the audit filter query explicitly supplied `action: undefined`, which violates `exactOptionalPropertyTypes`.
2. `PeopleProjectsPage.tsx`: the field factory explicitly supplied `value: undefined` to an optional property, also violating `exactOptionalPropertyTypes`.
3. `PeopleProjectsPage.tsx`: compensation setup passed a possibly undefined employee ID to an API method requiring a string.
4. `PeopleProjectsPage.tsx`: `HrShiftAssignment` was used but omitted from the type import.
5. `PeopleProjectsPage.tsx`: attendance rendering read `shiftName`, although `HrAttendance` did not declare the field. The backend attendance list query already returns the shift name.

Repairs:

- The audit query now omits `action` when the filter is blank.
- The form field factory omits `value` when no default was supplied.
- Compensation uses a small required-value guard that rejects a missing employee selection and returns a definite string.
- `HrShiftAssignment` is imported where it is rendered.
- `HrAttendance` now declares the optional `shiftId` and `shiftName` fields returned by the attendance query.

## Validation performed on the repaired source

- Backend test suite: **29/29 passed**.
- OpenAPI coverage: **248 operations across 190 routes; exact match**.
- Route-to-adapter coverage: **17 backend-backed adapters wired**.
- TypeScript/TSX syntax transpilation: **141 source files checked; 0 syntax diagnostics**.
- The Vercel build log for the diagnosed commit independently confirms that its preceding frontend unit-test stage passed **97/97 tests**.

## Validation boundary

The complete local `npm run build` commands were not rerun in this workspace: dependencies are not present in the supplied source copy, and the local package installation attempt did not complete. The repaired files therefore have passing backend tests, contract checks and syntax validation, but the next Render and Vercel builds remain the authoritative full semantic type-check and production-build verification.

The failing Render build stopped during image compilation. The Workstream 6 database migration was not run by that failed image build; production database state was not changed by this repair.
