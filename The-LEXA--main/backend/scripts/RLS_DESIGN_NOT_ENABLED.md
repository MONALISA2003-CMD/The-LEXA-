# PostgreSQL RLS runtime guide (supersedes the original design note)

This file name is retained for compatibility with earlier overlays. The 31 October 2026 implementation now **enables and forces PostgreSQL row-level security** in migration `20261030320000_platform_catalog_finance_rls`.

## Runtime contract

- The migration creates `lexa_app_runtime` as `NOLOGIN NOBYPASSRLS`, grants the role to the migration owner, and grants runtime DML on existing tables plus default privileges for subsequently created tables.
- Set `DATABASE_RUNTIME_ROLE=lexa_app_runtime` for the API after the migration is applied. `PrismaService` adds the role to the connection startup options.
- Every Prisma model delegate, raw query and interactive transaction is run through a transaction-local context wrapper. It sets `app.tenant_id`, `app.user_id`, `app.session_token_hash`, and `app.reset_token_hash` with `set_config(..., true)`.
- The global tenant guard resolves the session, verifies active workspace membership and branch grants, and enters the request-local context before domain reads/writes. Domain controllers retain their own ownership checks.
- Tenant-owned tables use tenant GUC policies. `memberships` has separate read and write policies: users may read their own membership rows across workspaces, but may only write membership rows in the current tenant. `sessions` and `password_reset_tokens` are user-owned and permit exact presented-token lookup while restricting writes to the owning user.

## Verification

Run `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f backend/scripts/test-tenant-rls.sql` against a **disposable** PostgreSQL database after `prisma migrate deploy`. It asserts that all tenant-owned tables have RLS, the runtime role is neither superuser nor `BYPASSRLS`, tenant A cannot read/write tenant B product rows, cross-tenant membership writes are denied, and sessions/reset tokens are user-scoped with exact-token lookup exceptions.

The isolated Neon branch `br-polished-sound-bad926f2` has also been checked directly: 41 tenant-keyed tables are present, 42 tables have RLS enabled, the runtime role has neither superuser nor `BYPASSRLS`, and the membership/session/reset policy sets are present. A two-user cross-tenant read/insert/update check passed using the runtime role. Production branch `br-snowy-hill-ba5a9ggc` was not modified.

## Production safeguards

Do not set `DATABASE_RUNTIME_ROLE` in the production service until migration `20261030320000_platform_catalog_finance_rls` has been applied successfully to that database and the API deployment uses the matching PrismaService wrapper. The migration and runtime-role setting must ship together. Keep the application-level tenant and branch authorization checks: RLS is defense in depth, not a replacement. Any future background worker must use the same transaction-local context wrapper and a non-bypass role.
