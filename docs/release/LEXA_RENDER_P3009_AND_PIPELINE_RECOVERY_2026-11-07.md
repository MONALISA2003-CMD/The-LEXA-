# LEXA Render, GitHub E2E and Vercel — verified incident and recovery

Date: 2026-11-07. **Source repair only; not a claim that production has been migrated or redeployed.**

## Render: identified production root cause

Approved Render workspace: `My Workspace`, production service `lexa-backend-api-live` (`srv-dbhp0f0m7kps73ffeqrg`). On 7 Nov, the latest Render deploys to `main` reported `update_failed` while the earlier deploy from commit `9f1386b61b67fee6ecdc524b87f4212012978908` remained live.

The failing Docker image **built successfully** (`prisma generate` and NestJS build completed); API startup aborted when `prisma migrate deploy` returned **P3009**. The production Neon `lexa` database's read-only migration history reported the original failed migration:

- `20261111100000_isolated_demo_sessions`, started `2026-11-07 02:59:28.855Z`;
- original PostgreSQL **SQLSTATE 42601**, `syntax error at or near ")"`;
- migration `CREATE POLICY demo_subscription_temporary_activation` contained one extra closing parenthesis at the end of its `WITH CHECK` expression;
- the following migration `20261112100000_personal_account_closure` remains pending and should be applied normally **after** the demo SQL issue is safely resolved.

Read-only production inspection confirmed **no** `demo_sessions` table, `demo_subscription_temporary_activation` policy, `lexa_demo_assert_start_limit` function or `lexa_demo_purge_expired` function. No customer records were changed by this inspection.

## Repair in this source package

1. Correct the extra parenthesis in the failed migration's SQL. No schema reset, table drop, data deletion or RLS bypass is involved.
2. Extend the pre-existing direct-Neon migration coordinator's known-failure recovery. Before `prisma migrate resolve --rolled-back 20261111100000_isolated_demo_sessions`, it verifies exactly one unresolved failed record, checks the original **42601 syntax error**, and confirms that **none** of the migration's database objects exist. If any condition differs, deployment aborts safely for manual investigation.
3. After the guarded `resolve --rolled-back`, normal `prisma migrate deploy` retries the *corrected* migration and applies later pending migrations. The API starts only after successful migration completion. This is consistent with Prisma ORM v7 production failed-migration recovery guidance: https://www.prisma.io/docs/orm/v7/prisma-migrate/workflows/patching-and-hotfixing
4. Add `backend/scripts/check-migration-sql-structure.mjs` to the backend build. It checks 57 PostgreSQL migration scripts for unexpected or missing parentheses outside strings/comments/dollar blocks. A regression test recreates the exact bad SQL and verifies rejection. This is a structural guard, **not** a substitute for running migrations on an isolated test database.
5. Update the production `render.yaml` Blueprint to `autoDeployTrigger: checksPass`, with build filters for `backend/**`, `render.yaml` and `.dockerignore`. This avoids triggering Render on ZIP-upload/delete commits before GitHub has imported and verified the source. **The existing live Render service currently has auto-deploy On Commit and no configured HTTP health-check path.** Apply/sync these settings in Render deliberately; merely including them in the repository does not change a service that is not Blueprint-managed.

## Other deployment failures already corrected and retained

- GitHub Playwright E2E run `42345731201` failed six tests at the same outdated Overview headline assertion. `lexa-frontend/e2e/helpers/localBusiness.ts` now checks the actual business heading and context, without skipping workflow tests.
- Vercel deployment `dpl_FnsL84Bkhw1B9gdpUiLT83V9MLpo` failed because frontend prebuild referenced `../scripts/check_module_group_palette.py` outside Vercel's isolated project root. The source now uses `lexa-frontend/scripts/check_module_group_palette.py` and preserves the repository-level compatibility wrapper.
- The production app must retain its private `noindex` policy. The public marketing site is a separate Vercel root (`lexa-frontend/marketing`) and should be indexable on its own verified domain.

## Required rollout safeguards

1. Take/verify a restorable production Neon snapshot or equivalent before migration recovery. Review migration history and object absence again if another deployment or database action occurred in between.
2. Upload the source archive **once** to GitHub's repository root and wait for the ZIP-import workflow to finish (dependency locks restored, Prisma validated, Node/backend tests, contracts, Nest build, frontend Vitest/TypeScript/Vite). Confirm the follow-on Playwright E2E job passes.
3. Make sure Render is configured to deploy **After CI Checks Pass** and to ignore archive-only commits (via synced Blueprint settings or the Render service dashboard). The service currently does not have the Blueprint's `/health/ready` readiness check configured; add it when appropriate and confirm the endpoint is healthy.
4. On the next Render backend deployment, watch `recover-known-failed-migration.mjs`, `prisma migrate resolve --rolled-back`, `prisma migrate deploy`, and `/health/ready`. **If the recovery's prerequisites fail, do not manually force `--applied`, reset the database, or delete `_prisma_migrations` rows.** Inspect the actual schema and history first.
5. Confirm the production Neon `_prisma_migrations` now records a successful new application of `20261111100000_isolated_demo_sessions` and subsequent `20261112100000_personal_account_closure`. Confirm production customer sessions, ownership rules, payments and dashboards are working. Do not enable public demo traffic against the production database.
6. Verify Vercel's new deploy is `READY` and its frontend-root palette prebuild passes; verify the real E2E run after CI. Preserve login and password-reset URLs until the marketing/app domain transition is tested.

No production SQL writes or Render configuration changes were performed in preparing this archive. **Until an actual successful CI + Render + Vercel run, no claim of a green deployment is warranted.**
