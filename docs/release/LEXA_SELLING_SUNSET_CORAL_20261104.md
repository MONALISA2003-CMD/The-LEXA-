# LEXA Selling — Sunset Coral Release

## What changes in this release

- All eight Selling destinations receive a bright, accessible Sunset Coral identity, clear navigation and polished descriptions.
- Checkout uses the shared stock and customer directory, approved selling-price lists and split payments. Cash tendered and change are shown separately; change does not count as revenue.
- Business receipts print in the actual seller's name, with business identity frozen on the completed transaction. Item names, SKU, item totals, tax information (where recorded), payment details, cashier, change, customer balances and return history can be displayed.
- Receipt printing has two formats: 80 mm thermal and A4 / browser Save as PDF. This does NOT issue URA EFRIS fiscal documents.
- Camera scanning no longer blocks itself through Permissions-Policy. ZXing enables EAN/UPC/Code 128 and other standard formats on supported mobile browsers. Opening a camera still requires HTTPS and the phone owner's browser permission. Manual entry and photograph scanning remain available.
- Sales & Receipts has genuine date-scoped sales/receipts trends, customer balances, product and payment-method comparisons.
- Real Sales Returns start from the original completed receipt and use the existing validated stock/refund reversal workflow; no dummy return register.
- Sales Orders preserve existing confirmation, stock reservations and dispatch workflows.
- Customer Invoices remain linked to completed sales and recorded payments, with clearer business language and trend context.
- Quotations have multi-product amounts, customer links, validity dates, optional discounts, proof of customer acceptance and conversion into a real Sales Order at the exact agreed final prices. This action validates the quotation in the backend, rejects altered products/prices and blocks duplicate conversion.
- Price Lists are drafts until the CEO approves them. Active lists affect future checkout prices. Historical receipt prices are immutable.
- Customers use the single shared business directory from Customers & Growth.
- The existing ledger and stock movement entries remain the financial source of truth; the selling dashboard aggregates real recorded transactions.

## Important practical limitations

- LEXA can request camera permission but cannot force Android, Chrome, embedded browsers or the user to grant access. Check that the deployed HTTPS response is allowed camera=(self), with no stricter reverse proxy rule. Use the camera within the directly opened website.
- LEXA's internal receipt, invoice and quotation do not invent an EFRIS QR, FDN, URA verification code or statutory tax authorization. Provide an independently valid EFRIS document when required by URA.
- Cash, mobile money and bank receipts are only records of money the business confirmed receiving. There is no claim of a live payment-gateway settlement.
- Historical receipts without seller snapshots use the current business name as fallback; do not present this as proof of the historical registered identity.
- Direct checkout and fulfilled-order sales already affect stock and financial postings. Creating a quotation or reserving an order does not count as a completed sale. An inventory shortfall can prompt purchasing but does not automatically create a supplier order.
- Sales bar charts are real operational records. 'Outstanding customers' is the current balance, not limited to the filtered sales dates.
- Discounts in quotations are entered as final agreed selling prices; only an approved price list affects direct checkout. Configuration of role-specific maximum quotation discounts is not claimed as complete here.
- This release must be imported and deployed before the live application changes. Backend/Frontend tests are evidence of build correctness, not proof of live end-to-end checkout with real users, providers and hardware.

## Rollout and acceptance

1. Import the complete ZIP through the current GitHub repository-refresh workflow.
2. Deploy Render backend first so its migrations are applied. Keep the direct Neon migration connection and migration guard in place.
3. Deploy Vercel frontend. Verify camera permission response headers on the real domain.
4. Sign in as an existing CEO; print a new receipt. Confirm the correct business name, TIN only when configured, item quantities and actual paid amounts.
5. Run: normal sale, split payment, cash tendered/change, credit sale, refund, return/restock, price-list approval, quotation acceptance and conversion, order partial dispatch, customer invoice and invoice payment.
6. Confirm actual stock balances, cash-session movements, customer debt and financial totals match. Verify no duplicate sale or order is created on retry.
7. Confirm staff roles only see actions they are authorized to perform. Test real Android camera permission once on HTTPS and barcode scan against a known product.
8. Compare LEXA Selling reports with recorded transactions. Do not enter artificial data into production merely to test the dashboard.

