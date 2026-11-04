# LEXA employee roles and tenant isolation — source implementation audit

Date: 2026-11-04. Target: `MONALISA2003-CMD/The-LEXA-` root-level source-import ZIP.

## Implemented

- CEO-only invitation, employee provisioning and staff-role management; independent owner approval remains required for sensitive workflows. No automatic elevation to owner.
- Backend role catalogue and per-role capabilities, exposed at an owner-restricted endpoint. Owner-facing team screens show role descriptions, assigned permissions and branch selectors.
- 20 invitable role profiles, including a dedicated `field_agent` role. Existing staff navigation remains subject to backend permissions, not just hidden links.
- Restricted branch assignments in invitations and direct employee provisioning, validated against tenant-owned branches. Restriction is the default for new invitations; all-branch access requires explicit selection. Membership and branch grants are saved in one transaction.
- Employee-specific attendance overview, personal leave and timesheet creation/submission; individual employee IDs are resolved server-side, not trusted from request payloads.
- Assigned field-service case listing and status updates, scoped to the signed-in employee. Case updates require work notes and are audited.
- Purchasing, inventory, quality, leave, timesheet and payroll approval capabilities separated. Generic approval access is not sufficient for owning-module decisions. An employee cannot approve their own recorded request where the underlying workflow enforces separation of duties.
- Stronger global-search boundaries for personnel-only profiles and permission-based module records.
- CEO-created employee accounts use tenant-scoped idempotency records within a serializable transaction to avoid accidental duplicate provisioning on retries. Invitation workflows retain replay protection and subscription seat checks.
- New/changed/reset passwords: **exactly 8 printable ASCII characters**, with uppercase, lowercase, number and symbol. Existing valid sign-ins are not retroactively rejected. Frontend and backend validation agree.
- CEO controls for suspension, access removal, role changes and branch permissions retain audit trails.

## Validation evidence

- `backend/npm test`: **211 passed** (including six new role and password hardening tests).
- `backend/npm run contract:check`: exact **385 operations** over **311 routes**, **17 adapters**.
- `backend/npm run backup:inventory-check`: **169** table backup decisions.
- `backend/npm run ledger:coverage`: **15** protected ledger workflows.
- Python analytics: **10** tests passed.
- Navigation/code-generation script tests: **3** tests passed; both generators execute.
- Static TypeScript/TSX parsing: **257 files**, **765** relative imports, no errors; the Prisma generated client is deliberately created at build time.
- Neon validation-branch SQL `EXPLAIN`: employee attendance, own leave, own timesheets and assigned cases passed without changing data.
- Full dependency-backed Nest and Vite builds and authenticated end-to-end HTTP tests **have not been run in this environment**. CI and owner-approved staging tests are required before production activation.

## Remaining acceptance gates and limits

1. Run GitHub import CI with the full backend Nest/Prisma build and frontend TypeScript/Vite build, then inspect every step.
2. On isolated staging businesses, verify cross-tenant and cross-branch denial by direct API calls and database RLS; confirm revoked sessions, audit events, staff seat limits and branch assignments.
3. Concurrency/load-test sales and inventory stock reservations, payables posting, payroll approvals, and retry behaviour for all critical mutations; this release does **not** certify universal idempotency across all LEXA endpoints.
4. Test employee leave/timesheet and assigned service tasks using real session cookies and role memberships. Verify a role cannot use direct API URLs to bypass dashboard filters.
5. Validate branch provisioning and multi-branch staff employment rules separately; LEXA retains existing one-location account-creation rules, although it can scope access among existing branches.
6. Keep MFA, strong account rate-limiting, breach checks and safe password recovery on the launch roadmap. **Exactly 8-character passwords with compulsory character classes are weaker than permitting longer passphrases**, despite being explicitly requested.
7. Production data, roles, passwords, database migrations, and deployments were not changed by preparing this ZIP.
