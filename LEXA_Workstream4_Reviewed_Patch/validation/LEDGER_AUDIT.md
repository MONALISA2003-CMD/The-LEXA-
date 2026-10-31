# Existing General Ledger and finance audit

The repo already has one integrated `ledger_*` implementation. Do not apply the older Increment 5 overlay's separate `gl_*` schema/controller on top of it.

Verified in the current source:

- `backend/src/app.module.ts` already registers `GeneralLedgerController`.
- `lexa-frontend/src/app/router.tsx` already routes `/modules/accounting` to the existing `GeneralLedgerPanel`.
- The Prisma schema and SQL migrations define ledger accounts, accounting periods, journal headers/lines, reversal references and posted-journal/line immutability guards.
- The controller exposes chart of accounts, periods, journals, posting/reversal, trial balance, profit and loss, balance sheet, source reconciliation and account activity.
- `FinanceOperationsController` exposes cash sessions, cash movements/close, cash-ups, bank accounts/statements/reconciliation, expenses/categories, cost centres and fixed assets/depreciation.
- Source postings exist for POS sale completion, sale payment, sale return, stock movement/opening stock, goods receipt, customer receipt, supplier invoice approval and supplier payment. The source verifier checks those event identities and branch-scope checks.
- Cash-up posting, expense approval, fixed asset acquisition and depreciation have their own source ledger journals. Bank reconciliation matches existing ledger lines rather than creating duplicate accounting events.

This patch fixes the depreciation field mismatch (`period.startDate` → `period.startsOn`) and adds a ledger posting plus verifier requirement for sales-order fulfilment. Other existing ledger/finance functions are preserved, not replaced.
