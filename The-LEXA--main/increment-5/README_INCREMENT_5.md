# LEXA Increment 5 — General Ledger

This is a **repository overlay**, not a replacement application. Extract it at the root of `MONALISA2003-CMD/The-LEXA-` so the existing `backend/` and `lexa-frontend/` trees are extended in place. No product, sale, stock, customer, supplier, receipt, invoice, or payment records are deleted or recreated.

## Included files

- `backend/prisma/migrations/20261030220000_general_ledger/migration.sql` — ledger tables, seeded chart and posting mappings, accounting periods, source triggers, historic source projection, immutable journals/audit and stock cost snapshot.
- `backend/src/general-ledger/general-ledger.controller.ts` — authenticated and CSRF-protected ledger API, owner/admin/accountant permissions, journal posting/reversal, period operations, reports, reconciliation and audit history.
- `backend/src/app.module.ts` — registers the General Ledger controller.
- `patches/schema-stock-movement.patch` — adds the inventory cost snapshot to Prisma's existing `StockMovement` model.
- `lexa-frontend/src/data/remote/apiGeneralLedger.ts` — typed API client.
- `lexa-frontend/src/modules/operations/GeneralLedgerPage.tsx` and `general-ledger.css` — General Ledger workspace UI.
- `lexa-frontend/src/app/router.tsx` — routes `/modules/accounting` to the dedicated ledger screen.
- `patches/module-catalog-accounting.patch` — changes the old generic Accounting journal register into a read-only General Ledger entry point, avoiding a second independent journal or payment register.
- `apply-increment-5.sh` — validates and applies the overlay and source patches.
- `verify-increment-5.sh` — runs Prisma validation/generation, backend build, frontend build and `git diff --check`.

## Apply in the repository

1. Extract the archive into the root of a clone of `The-LEXA-`, preserving folder paths. The archive creates an `increment-5/` folder beside the existing `backend/` and `lexa-frontend/` folders.
2. From the extracted folder, run the included apply script:

   ```bash
   bash increment-5/apply-increment-5.sh
   ```

   The script first checks both source patches, then overlays only the new/updated files and applies the two small patches. It does not remove or replace operational source tables or transaction records.

3. Validate and build with the included script:

   ```bash
   bash increment-5/verify-increment-5.sh
   ```

   Or run the commands manually:

   ```bash
   cd backend
   npx prisma validate
   npx prisma generate
   npm run build
   cd ../lexa-frontend
   npm run build
   ```

4. Review `git diff`, run the project's existing tests, then commit and push through the repository's normal review process. The existing Render Docker startup runs `prisma migrate deploy`; once the migration is approved and included in the deployed commit, Render applies it before starting the API. Vercel's connected Git deployment then builds the frontend route.

Do not manually run the migration against production before code review and deployment approval. The schema migration backfills only the General Ledger projection from the existing operational rows; the source rows remain authoritative.

**Deployment status:** this archive has not been pushed or deployed by this session. The linked GitHub integration is currently returning `403 Resource not accessible by integration` for write operations. After repository write access is restored, push the reviewed code commit; Render runs `prisma migrate deploy` before starting the backend, and Vercel deploys the matching frontend commit. Confirm both deployments are healthy before using the new accounting screen.

## Accounting behaviour

- **Sales:** completed operational sales debit Accounts Receivable and credit Sales Revenue. Existing sale-payment rows debit the configured cash/bank/wallet account and credit AR. Recorded POS refunds debit Sales Returns and credit cash.
- **Customer receipts:** standalone AR receipts debit the mapped cash account and credit AR. POS receipts mirrored into the AR receipt table are skipped there; the original `sale_payments` row is the single GL source for that receipt.
- **Supplier bills:** accepted goods receipts debit Inventory and credit Goods Received Not Invoiced. Approval of the existing supplier invoice debits GRNI, recognises any receipt-cost versus invoice-subtotal difference in Purchase Price Variance, debits recoverable input tax, and credits AP. Existing supplier payments debit AP and credit the configured cash/bank/wallet account.
- **Stock:** sale issues post COGS/inventory; returns restore inventory/reverse COGS; opening stock, positive/negative adjustments, write-offs and inter-branch transfers use their own control postings. A cost snapshot is saved at movement time so subsequent product-cost edits do not rewrite future movement costs.
- **Journals:** manual entries begin as drafts, must contain at least two one-sided debit/credit lines and balance before posting. Posted entries and their lines are immutable; correct them with a reversing journal. Drafts can be voided.
- **Periods:** seeded monthly periods cover January 2026–December 2027 and are initially open. Additional non-overlapping periods can be configured. Closing checks there are no remaining drafts; only an owner/admin can reopen a closed period.
- **Reports:** Trial Balance, P&L and Balance Sheet use posted GL lines only. Reconciliation compares AR, AP, inventory and cash/bank control accounts with operational source balances and shows variances instead of silently adjusting them.

## Important valuation and operational notes

The old `stock_movements` table did not retain historical unit cost. Its migration backfill therefore values existing movements using the product's current cost; all future movements receive a cost snapshot on insert. This limitation is explicitly surfaced in the inventory reconciliation screen. The newest LEXA Neon tenant currently has no source transaction rows, so the migration will not invent historical transactions there.

Automatic source posting runs in the same database transaction as the operational write. A missing/disabled rule, missing active mapping, unbalanced posting, or closed/missing accounting period rejects that operational write rather than allowing an unledgered sale, receipt, bill, payment, or stock movement. Keep required posting rules enabled and their mappings valid.

Cash reconciliation excludes opening cash/bank balances that were not entered through an operational receipt/payment. Those opening balances should be entered as approved balanced opening journals before relying on cash control reconciliation.

## Verification scenarios

Use a non-production test tenant/branch with open periods. Verify at least:

1. A completed sale of 500,000 minor units creates Dr AR 500,000 / Cr Sales Revenue 500,000.
2. A recorded sale receipt of 200,000 creates Dr the mapped cash account 200,000 / Cr AR 200,000; the mirrored AR receipt must not create a second journal.
3. A goods receipt with cost 100,000 creates Dr Inventory 100,000 / Cr GRNI 100,000.
4. Approval of a supplier invoice with subtotal 110,000 and input tax 11,000 creates Dr GRNI 100,000, Dr Purchase Price Variance 10,000, Dr Input VAT 11,000 / Cr AP 121,000.
5. A supplier payment of 121,000 creates Dr AP 121,000 / Cr the mapped bank/cash account 121,000.
6. A stock issue with saved cost 80,000 creates Dr COGS 80,000 / Cr Inventory 80,000.
7. Trial Balance ending debit and credit columns agree; P&L and Balance Sheet match posted journal activity; AR/AP/inventory/cash reconciliations are matched when no opening differences exist.
8. Try a duplicate source event, an unbalanced journal, posting into a closed period, and editing a posted journal/line; each must be rejected or deduplicated as appropriate.
