# LEXA — Workstream 4 CRM + selling flow and accounting build repair

**Reviewed base:** `main` at `895b0d50e7ee99e6e215ed1a4dd7295ee595b747` (31 October 2026)

This is a **reviewed, hash-guarded source patch**, not an unreviewed ZIP overlay. The apply script checks the Git blob hashes of the ten files it edits and validates every expected source anchor before it writes anything. If `main` has moved, it stops so the changes can be rebased and reviewed rather than overwriting newer work.

## Included changes

- Repairs the active Render TypeScript error: `AccountingPeriod.startsOn` is the real Prisma field; depreciation was incorrectly reading `startDate`.
- Repairs the pending finance/RLS migration by adding the missing `(tenant_id,id)` unique targets used by the composite foreign keys on bank statement lines and bank reconciliations.
- Adds normalized CRM tables for customers, suppliers, contacts, leads, opportunities, campaigns, sales teams, territories, quotations and quote lines. Existing versioned `module_records` remain the compatibility/API surface and are projected into the domain tables in the same database transaction.
- Connects contacts, leads, opportunities and quotations to CRM party/campaign/team IDs. Existing generic module records and historical snapshots are retained.
- Links customer IDs to sales orders, completed sales, AR invoices and AR receipts; links supplier IDs to purchase orders, AP invoices and AP payments. The migration backfills existing links where the source record ID is available.
- Updates workspace backup restore to populate the new sale-line branch identity while leaving unavailable historical quote/order references null.
- Adds stable quote-line → order-line → sale-line → AR invoice-line source IDs. Selling-price, tax and cost snapshots are retained on order/sale lines; old order lines without an historical cost snapshot are initialized once from the current catalogue cost.
- Adds a duplicate-safe **Accepted quotation → sales order** API transaction. It validates quote expiry, customer status, product mapping and line totals; locks the quote row; stores one unique order per source quote; and retains line source references.
- Connects order fulfilment to the existing `ledger_*` General Ledger: AR debit, net sales revenue, output tax, and inventory/COGS are posted in one balanced, idempotent transaction.
- Wires the visible Leads screen's conversion action to the existing API endpoint, makes the action available after qualification, locks the lead before conversion, and returns the already-created customer for repeated requests.
- Extends the ledger posting coverage guard to require the new sales-order fulfilment `sale_completed` posting.

## Apply the patch

1. Extract this ZIP. Keep the folder `LEXA_Workstream4_Reviewed_Patch` intact.
2. Open a terminal at the **root of a clean clone** of `MONALISA2003-CMD/The-LEXA-`.
3. Run:

   ```bash
   python3 LEXA_Workstream4_Reviewed_Patch/apply-reviewed-patch.py
   ```

4. Inspect the complete diff. The script refuses to apply if the reviewed base files have changed.

The patch does not connect to or modify production Neon. It adds migration `20261030330000_crm_first_class_entities_and_quote_acceptance` to the repository.

## Required local validation before merge/deploy

```bash
cd backend
npx prisma validate
npx prisma generate
npm run ledger:coverage
npm test
npm run build
cd ../lexa-frontend
npm run typecheck
npm test
npm run build
cd ..
git diff --check
```

After reviewing the diff and passing the checks, commit and push the reviewed source changes. Render is configured to deploy from `main`; Vercel also tracks `main`. Confirm the actual deployment IDs and health status after the new commit rather than relying on the previous deployment.

## What was and was not verified in this session

- Read access to all ten edited source files was confirmed. Their Git blob hashes match the patch's expected base, and every source-edit anchor was checked to occur exactly once.
- The patch script passes Python syntax compilation.
- The existing General Ledger was audited. The project already has one integrated `ledger_*` ledger, registered `GeneralLedgerController`, an Accounting route/page, immutable balanced journals, periods, reversals, TB/P&L/BS and source reconciliation. The older Increment 5 overlay's separate `gl_*` schema/controller must **not** be layered on top of it.
- The existing ledger posting hooks cover POS sales/payments/returns, stock movements, goods receipts, customer receipts, supplier invoice approval and supplier payments. The patch adds the missing sales-order fulfilment posting and a corresponding coverage assertion.
- On a clean isolated Neon child branch, pending migrations `303000`, `303100` and the corrected `303200` SQL completed. The original `303200` failed until the two missing composite unique constraints were added.
- A separate earlier Neon test branch successfully exercised the CRM projection pattern (lead → customer, quote → customer and stable quote-line mapping), with test records deleted afterward. The final `303300` migration in this package has **not** yet been fully executed on the clean child branch, and Prisma's migration history was not marked complete.
- Dependency-backed Prisma generation, backend/frontend typecheck, tests and builds were not run here because this environment did not have a full repository checkout. Do not treat the package as build-green until the commands above pass on the patched checkout.

## Current deployment snapshot (before this patch is applied)

- **Vercel:** latest inspected production deployment at base SHA `895b0d5` was `READY`. The new frontend change still needs a build after the patch is applied.
- **Render:** latest inspected build at the same base SHA failed in `finance-operations.controller.ts` because of the `startDate`/`startsOn` mismatch. The patch fixes the source error, but Render cannot become green until the patch is committed/pushed and a new build succeeds.
- **GitHub:** the connected GitHub integration returned HTTP 403 for writes, so no commit or deployment was started by this session.

Production Neon was not migrated or changed.
