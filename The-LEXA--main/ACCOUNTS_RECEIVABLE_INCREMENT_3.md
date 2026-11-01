# LEXA Increment 3 — Customer Invoicing & Accounts Receivable

## Purpose

Add a typed, auditable billing and receivables workflow that follows a completed sale. The invoice stores an immutable snapshot of the source sale and its lines. Receipts are allocated against issued invoices and reconciled into the existing sales-payment ledger.

## Frontend

The existing **Sales invoices** module is connected to a dedicated Accounts Receivable workspace with:

- Completed named-customer sales eligible for invoicing.
- Draft invoice creation with invoice and due dates.
- Issue action for a draft invoice.
- Invoice register with lines, sale reference, total, receipts, balance and status.
- Customer receipt recording and allocation.
- Receipt register.
- Outstanding, overdue and not-yet-due totals plus 1–30, 31–60, 61–90 and over-90-day ageing buckets.
- Read-only generic invoice register metadata. Create, issue, allocate or change status only through typed workflow endpoints.

The Vite/Vitest plugin in `lexa-frontend/vite.config.ts` integrates the Accounts Receivable panel into the existing Operations module shell and marks `sales-invoices` read-only while retaining its original fields as detail-only metadata. This keeps the existing shell and module catalogue structure intact.

## Backend routes

All routes use the existing global `/api/v1` prefix and the signed-in `lexa_session` cookie. Mutations also use the existing CSRF protection. Route base:

`/workspaces/:workspaceId/branches/:branchId/receivables`

| Method | Path | Purpose |
|---|---|---|
| GET | `/eligible-sales` | List completed, named-customer, positive-value sales not already invoiced and without returns |
| GET | `/invoices` | List branch invoices, line snapshots, receipt totals and balances |
| POST | `/invoices` | Create one draft invoice from a completed sale |
| POST | `/invoices/:invoiceId/issue` | Issue the draft and import receipts already recorded against its source sale |
| POST | `/invoices/:invoiceId/void` | Void a draft invoice without changing the sale or stock ledgers |
| GET | `/receipts` | List customer receipts and their invoice allocations |
| POST | `/receipts` | Record and fully allocate a customer receipt, with an idempotency key |
| GET | `/summary` | Return current, overdue and aged receivables totals |

## Database changes

Migration: `backend/prisma/migrations/20261030200000_accounts_receivable/migration.sql`

Adds:

- `ar_customer_invoices`
- `ar_customer_invoice_lines`
- `ar_customer_receipts`
- `ar_customer_receipt_allocations`

The migration also adds a currency-scale helper and a trigger on `sale_payments` so receipts created through the existing Sales screen are reflected in Accounts Receivable after invoice issue. The trigger locks the invoice row while deciding whether to mirror a payment; the issue-time backfill picks up payments made while the invoice was still a draft. The internal AR endpoint sets a transaction-local flag to avoid double capture.

A second trigger prevents generic `module_records` CRUD from creating, editing or deleting `sales-invoices` records outside the typed receivables controller. The controller writes the module record in the same database transaction as the invoice action.

## Posting and integrity rules

1. A source sale must be completed, belong to the selected workspace and branch, have a named customer, have a positive total, contain lines that sum exactly to the sale total, and have no recorded return.
2. Only one active (non-void) invoice may exist for a source sale. Draft invoices can be voided and replaced; issued invoices cannot be edited or voided in this increment.
3. Invoice lines are snapshots of the existing sale lines. The source sale and stock ledgers are not rewritten.
4. Draft and issue actions do not create stock movements.
5. Receipts must be positive integer minor-unit values and the total must equal the sum of the allocations. A receipt can be allocated across multiple open invoices belonging to the same customer. No allocation may exceed the invoice balance.
6. AR receipts also create matching `sale_payments` rows in the same transaction. Existing POS/Sales-screen receipts against an issued invoice are captured by the database trigger. This preserves `sale_payments` as the canonical cash-receipt ledger.
7. Repeated receipt requests using the same idempotency key and request body return the existing receipt; reusing the key with different data is rejected.
8. A receipt entered before invoice issue is included by the issue-time backfill. The payment trigger and issue path lock the invoice row to serialize the issue/backfill decision.
9. Refunds against an issued invoice are blocked until the customer credit-note workflow is implemented. Returns recorded before issue also prevent issue.
10. No payment rail is called. The system records a payment reported as received; it does not send or verify money transfers.

## Deliberate scope limits

- Tax is stored as zero in this increment; the completed sale total is preserved exactly. These are internal billing invoices, not statutory tax invoices.
- No Uganda tax determination, tax-code engine, EFRIS submission or statutory invoice numbering claim is made here. These require a separate tax increment with current legal verification.
- Supplier invoices / Accounts Payable, supplier payment allocation, customer credit notes, unallocated customer advances, customer statement PDF/email delivery, GL posting and credit-limit enforcement are not included.
- No production transaction data was created during package preparation.

## Files

```text
INSTALLATION.md
ACCOUNTS_RECEIVABLE_INCREMENT_3.md
PATCH_VERSION.txt
backend/src/app.module.ts
backend/src/receivables/receivables.controller.ts
backend/prisma/migrations/20261030200000_accounts_receivable/migration.sql
lexa-frontend/vite.config.ts
lexa-frontend/src/data/remote/apiReceivables.ts
lexa-frontend/src/modules/operations/AccountsReceivablePanel.tsx
lexa-frontend/src/modules/operations/accounts-receivable.css
lexa-frontend/src/modules/operations/receivablesMath.ts
lexa-frontend/src/modules/operations/receivablesMath.test.ts
```
