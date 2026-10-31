# LEXA — Workstream 6 implementation

## Scope delivered

Workstream 6 adds typed, tenant- and branch-scoped backend records and a dedicated frontend workspace for People, Projects and Support. The Inbox remains the shared queue for decisions, but a decision only succeeds through the owning typed business workflow.

### People and workforce

- Employee directory with employee numbers, employment details, manager hierarchy and optional linked workspace user.
- Confidential, effective-dated compensation in a separate table from employee directory fields.
- Shift templates and effective-dated employee shift assignments.
- Attendance records, clock details, reviewed attendance and shift references.
- Leave requests, submission, review/approval and overlap protection.
- Timesheets linked to employees, projects and project tasks; cross-project daily-hour bounds are checked in serializable transactions.

### Payroll

- Payroll runs, employee payroll lines and itemized deductions.
- Calculation uses approved timesheets, approved leave and reviewed absences only. Draft/pending/rejected time and leave records do not flow into payroll.
- Monthly prorating uses integer minor-unit arithmetic and supports fractional leave days.
- Payroll runs must be calculated, submitted for shared approval, approved and only then recorded as paid.
- The payment endpoint records the external payment reference/date; it does not initiate a bank or mobile-money transfer.

### Projects, costs and support

- Projects with manager, budget and status.
- Project tasks assigned to employees.
- Project costs with source references and timesheet labour costs created from approved project timesheets.
- Customer/task references on support cases plus employee assignment, priority, due date and resolution tracking.

### Shared workflow and audit

- Leave, timesheet and payroll approvals are handled by `PeopleProjectsService.decideSharedApproval`.
- Unsupported/legacy generic approvals fail closed; requesters cannot approve their own requests.
- Project managers can decide/view timesheet approvals only for projects they manage or tasks assigned to them.
- Typed Workstream 6 registers cannot be changed via generic module-record writes.
- HR, project and support APIs append to `audit_events`; database triggers reject audit event updates and deletes.

## Data protection and access

- All typed rows are constrained by tenant and branch foreign keys.
- Compensation is stored outside the directory table and returned only with `people.compensation.read`.
- HR contact/personal details use `people.private.read`; payroll access is separately gated by `payroll.read` / `payroll.write`.
- Employee self-service is limited to the linked employee's allowed personal record/request operations.
- Project, support and audit visibility use their separate `projects.*`, `support.*` and `audit.read` capabilities.
- Role and branch checks are enforced on the server; frontend visibility is not treated as authorization.

## New backend API

All endpoints are nested under:

`/workspaces/:workspaceId/branches/:branchId/workstream6`

32 typed routes cover:

- `people/employees`, employee compensation
- `people/shifts`, shift assignments
- `people/attendance`, attendance review
- `people/leave`, leave submission
- `people/timesheets`, timesheet submission
- `people/payroll/runs`, calculation, lines, deductions, submission and payment recording
- `projects`, project tasks and project costs
- `support/cases`
- `audit/events`

The OpenAPI contract and route/adapter checks were updated with the same routes.

## Database migration

`backend/prisma/migrations/20261031190000_workstream6_people_projects_collaboration/migration.sql`

Creates 14 typed tables: `hr_shifts`, `hr_employees`, `hr_employee_shift_assignments`, `hr_employee_compensation`, `hr_attendance`, `hr_leave_requests`, `projects`, `project_tasks`, `hr_timesheets`, `project_cost_entries`, `hr_payroll_runs`, `hr_payroll_lines`, `hr_payroll_deductions`, and `support_cases`.

The migration adds branch context to audit events and database triggers for append-only audit records and for non-overlapping effective shift, compensation and leave intervals. Cross-record composite foreign keys enforce same-tenant/same-branch relationships.

## Verification performed

- Backend tests: **29/29 passed** (`node --experimental-strip-types --test test/*.test.mjs`).
- OpenAPI exact match: **248 operations across 190 routes**.
- Route-to-adapter coverage: **17 backend-backed adapters passed**.
- TypeScript syntax transpilation: **0 syntax errors** across 11 touched/new TS/TSX files.
- Isolated Neon validation branch: all 14 tables and five key triggers confirmed; migration SQL committed successfully there.
- Render backend current deployment before this Workstream 6 release: `live`.
- Vercel latest production deployment before this Workstream 6 release: `READY`.

## Release status and required next action

The Workstream 6 code is packaged but is **not yet on GitHub `main`, Render or Vercel**. Direct GitHub write requests from the connected integration returned HTTP 403 (`Resource not accessible by integration`). Upload this ZIP at the root of `MONALISA2003-CMD/The-LEXA-` on `main`; the repository's existing ZIP Extractor workflow will extract the root-relative paths and commit them. Do not put the files inside an extra `The-LEXA--main/` parent folder.

The ZIP includes the already-green Workstream 5 Render migration recovery files as a baseline overlay. Once the extractor commits, Render's main-branch auto-deploy will build the backend and apply the Workstream 6 Prisma migration. Vercel's Git integration should build the matching frontend deployment.

The production Neon branch has **not** been manually migrated or changed in this implementation run. The migration was applied only to the isolated validation branch. Verify the new Render deployment and Vercel deployment after the upload before treating Workstream 6 as live. A dependency-backed full NestJS/Prisma compile has not been run in this environment because the working copy does not contain installed `node_modules`.
