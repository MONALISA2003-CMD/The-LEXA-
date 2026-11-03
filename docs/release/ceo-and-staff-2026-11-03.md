# CEO and staff management release — 3 November 2026

## Intended behavior
- Every existing active `owner` membership stays intact, and any verified direct signup is CEO of its own single new workspace.
- Additional business/branch creation is denied through user-facing protected APIs; the internal Main accounting location remains to preserve foreign keys.
- CEO can open Business Profile Setup, edit the existing business, manage staff accounts, and use all authorized operational modules.
- Staff accounts are created inside the current tenant, never through a new signup. Each staff member has a role, employee record, unique username and CEO-set temporary password.
- A staff member must choose a new private password before accessing workspace resources. A CEO may reset their temporary password, invalidating earlier sessions.
- Employee profile private data is tenant-scoped with PostgreSQL RLS and CEO-checked API endpoints. Employee self-service exposes only basic own employment information.

## Regression evidence (pre-upload)
- Backend typecheck and Nest build, backend node tests, OpenAPI route/adapter coverage, frontend Vitest and TypeScript/Vite build.
- Additive migration applied successfully to isolated Neon validation branch, not production.
- Live production owner roles were independently read-only checked: 9 active owner memberships across 3 user accounts before release.
- Direct browser login for the CEO screenshot account must be smoke-tested after deployment: open My Business, edit profile, save, reopen, create a test staff employee, sign in with temporary credentials, rotate password, verify staff navigation, suspend employee.
- Existing business and sales data must not be deleted, recreated or transferred as part of onboarding.

## Known boundaries
- Existing accounts with multiple historical businesses are retained rather than merged/deleted automatically. New account/workspace creation is constrained.
- Existing payroll and statutory tax rules are not replaced by this release. Employee compensation remains handled by the HR & Payroll module.
- Company-specific approval amounts and dual-control workflows are not automatically enforced in all modules by this release; configure and test the corresponding financial and operational approval workflows before relying on them for high-value transactions.
- Production tests require deployment of the full matching backend/frontend/migration build.
