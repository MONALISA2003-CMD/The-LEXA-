
# LEXA — Orders, Invoices, Deliveries & Packages

Release scope: additive, current business data preserved.

## Core corrections

- Business and internal location context are explicitly restored in the invoice, sales-order and delivery request controllers. A valid active membership is still mandatory; the CEO retains full control and staff remain role-restricted.
- Sales-order dispatch uses the confirmed order line price instead of the current catalogue price, retaining the amount agreed with the customer across quotations, orders, sales, financial postings and deliveries.
- New logistics packages are linked to real customer sales orders and line items, and are checked against unshipped and unpacked quantities.
- Packages can be packed, sealed, dispatched as part of a real order fulfilment, marked delivered or returned, or cancelled while unsent. Cancelling an unsent package releases its packed quantities. Packing and printing do not deduct stock or count revenue.
- The existing sales-order fulfilment supports selecting sealed packages. Exactly the selected shipped quantities must match the sealed contents. Existing direct dispatch remains available for legacy business workflows.
- A separate tenant-scoped, RLS-protected package and package-lines database schema has been introduced, including backup inventory coverage and API permissions.
- New customer invoices preserve the seller's business identity from the original sale or current business profile at invoice creation. The customer invoice print view shows original products, quantities, prices, total, payments and balance due, and can print/save PDF.
- Invoice summary and ageing charts now distinguish overdue balances from customers yet to pay. On widespread API errors, the page shows a clear recoverable error rather than pretending zero records.
- Sales Orders have brighter coral summary charts and a corrected mobile layout; Deliveries and Packages use bright Aurora Violet with current status, shipment and transport views.
- Package labels include a real scannable Code 128 barcode using JsBarcode. The packing workstation supports barcode camera/photo/manual entry through the existing scanner, and prints professional packing slips in each business name.

## Live system and verification

- Backend compilation passed.
- Backend: 158 tests passed.
- API contract coverage: 346 operations, 279 routes.
- Frontend typecheck passed after adjusting the palette generator to retain Aurora Violet.
- Both new migrations applied successfully to an isolated Neon branch, **not production**.
- The production database was not changed while preparing this ZIP.

## Deployment

1. Save the ZIP, then import its complete repository contents through the established GitHub refresh workflow. This archive has no extra root README_FIRST.md and no node_modules/build directories.
2. Render backend deploy runs the existing migration coordinator against the direct Neon URL; it must complete the new 20261104050000 and 20261104060000 migrations before API traffic is accepted.
3. Vercel frontend deploy should be done after the backend is live.
4. Sign in as an existing CEO. Check Sales Invoices / Sales Orders / Deliveries / Packages are accessible and empty states are helpful on a business with no transactions.
5. Create a customer, products, sales order and confirm it; pack the ordered product, scan its barcode, print a slip, seal it, dispatch selected packages and verify that stock decreases once and sale value matches the agreed order price.
6. Complete a named-customer sale, invoice it, verify invoice business name and download/print. Record a partial payment; check outstanding balance and graphs.
7. Test refund and failed-delivery paths; delivered status should update linked packages without issuing another sale.
8. Test as Cashier, Sales Manager, Accountant, Storekeeper and Delivery Officer, confirming each sees only authorised operations.
9. Verify live API request results and physical Android camera permissions. No build can guarantee browser permissions, carrier notifications, or a live URA EFRIS document.

## Limits

- Internal LEXA invoices are **not** official URA EFRIS fiscal documents.
- A delivery photo/signature requires the existing platform attachment process and an authorised verified event; the new packing slip is a product record, not independent proof of actual recipient identity.
- Last-mile geolocation, live rider tracking, automated SMS/WhatsApp delivery notifications and actual payment settlement require separately configured services.
- Sales-order trend charts on existing screens summarise the recently returned orders, while invoice ageing uses the receivables summary. No unverified amounts should be interpreted as ledger totals.
- Backend/frontend builds and Neon test branch cannot prove that all phone/browser and production integrations are green until the uploaded release is deployed and live acceptance testing succeeds.

