# LEXA Render current blocker fix

This patch addresses the confirmed backend build failure on the current LEXA `main` revision (commit `6d7ea9f2c040d522f5abb6a6d415bdcac8b2a42f`).

## Root cause

`backend/src/finance/finance-operations.controller.ts` references `period.startDate`. The Prisma `AccountingPeriod` model defines `startsOn: Date`, not `startDate`.

The intended expression is:

```ts
entryDate:period.startsOn.toISOString().slice(0,10)
```

## Apply

1. Check out/pull the latest `main` branch.
2. From the repository root, run:

   ```bash
   python3 LEXA_Render_Current_Fix/apply_render_fix.py
   ```

3. Review the exact one-line diff:

   ```bash
   git diff -- backend/src/finance/finance-operations.controller.ts
   ```

4. Validate before pushing:

   ```bash
   cd backend
   npm run build
   npm test
   npm run db:validate
   npm run ledger:coverage
   ```

5. Return to the repository root, commit the change and push to `main`. Render is configured to auto-deploy on commits to `main`.

## Guard rails

The script checks the Git blob SHA of the target source file and requires exactly one old expression before modifying anything. It aborts without changing the file if the source is not the reviewed revision or the anchor is missing/duplicated.

This patch does not run database migrations or change secrets/environment variables. Do not promote the backend until the subsequent Render build succeeds, migrations finish, and `/health/ready` passes.
