# LEXA Increment 4 — Supplier Invoicing & Accounts Payable

This repository overlay adds typed supplier bills, approval, payment allocation, ageing, and purchase/receipt reconciliation.

## Workflow
1. Select an existing purchase order with posted accepted goods-receipt quantities.
2. Create a draft supplier bill against those accepted receipt lines.
3. Approve the bill. Approval reserves the receipt quantities against other approved bills.
4. Record a supplier payment and allocate it across approved bills for one supplier and currency.
5. Review ageing and the purchase/receipt/payment reconciliation.

## Data integrity
- Purchase orders, goods receipts, and accepted stock movements remain the existing canonical records.
- Supplier invoice lines reference the existing purchase-order and goods-receipt lines.
- Supplier payments and allocations are stored in typed AP tables and mirrored to the existing Payments module register with the selected cash, bank or mobile-money account.
- No supplier payment is written into customer `sale_payments`.
- Tenant, branch, session, CSRF, approval, idempotency, and audit checks are enforced by the backend.
- Generic writes to `purchase-invoices` and `sales-invoices` are rejected; the typed workflows own those registers.

## Install
Upload this ZIP to the root of `MONALISA2003-CMD/The-LEXA-` on branch `main`. The existing ZIP Extractor workflow should commit the extracted overlay. Do not run the migration manually: Render applies Prisma migrations during backend deployment.
