# LEXA Phase 1–4 hardening and benchmark

Research reviewed: 28 October 2026. This document records external product-pattern research and an implementation/acceptance plan for the LEXA frontend. It is not a claim of feature parity with any listed system.

## Benchmark findings (external systems)

| Reference system | Documented pattern | LEXA implication |
|---|---|---|
| ERPNext | Sales, procurement, stock, accounting, CRM, manufacturing, projects, POS, quality, support, assets and HR are connected ERP domains. Its documentation specifically calls out lead → opportunity presales, material consumption/work orders and accounting transactions. | Keep the broad module map, but require master records and document workflows to share stable IDs through a future API. Do not treat a screen existing as proof that downstream posting is implemented. |
| Odoo | A sales quotation can be accepted into a sales order, followed by delivery, invoice and payment. These are distinct steps and documents. | Use related-record draft actions; preserve the original source document and references when preparing downstream drafts. |
| Zoho Inventory | The report centre groups sales, inventory, advanced batch/serial tracking, inventory valuation, warehouses, receivables, payments, payables, purchases/expenses, activity and automation. | Reports should offer period filters, searchable report names, CSV export, date ranges, and clear traceability to the source register. |
| Zoho inventory reports and barcode guidance | Inventory summaries can report on-hand, reorder levels, quantities ordered, inward/outward movements, stock counts/variance, warehouse locations, batches/serials, expiries, and stock turnover. Barcode labels can encode SKU/EAN/UPC and batch or serial IDs. | Preserve the core stock-movement ledger as the source of on-hand figures. Keep batch/serial and warehouse previews separate until those records actually affect the live ledger. |
| Microsoft Dynamics 365 Business Central | Availability checks account for inventory already requested or reserved in other documents; availability can change while the user is working and should be checked again before confirmation. | Future live inventory API calls should re-check available quantity during confirmation, not trust only a UI snapshot. |

Sources: [ERPNext documentation](https://docs.erpnext.com/index), [ERPNext modules](https://frappe.io/erpnext/modules), [Odoo sales quotations](https://www.odoo.com/documentation/18.0/applications/sales/sales/sales_quotations.html), [Zoho Inventory report overview](https://www.zoho.com/us/inventory/help/reports/reports-overview.html), [Zoho Inventory reports](https://www.zoho.com/us/inventory/help/reports/inventory-reports.html), [Zoho barcode generation](https://www.zoho.com/us/inventory/help/items/qrcode-generation.html), [Business Central item availability / tracking](https://github.com/MicrosoftDocs/dynamics365smb-docs/blob/main/business-central/inventory-how-work-item-tracking.md).

## Scope currently represented in the frontend

### Phase 1: usable core

- Workspace and first-branch setup, recovery for an already-saved browser workspace, workspace/branch selection and responsive app shell.
- Product catalogue metadata, search/category/status filters, activate/deactivate, case-insensitive duplicate SKU/barcode protection.
- Stock-opening and adjustment records, branch movement history and on-hand calculations derived from movements.
- Checkout cart, whole-unit stock checks, recorded payment methods, receipt and linked return/refund entries.
- Sales register and detail, printing, date/search filters, dashboard figures from the existing core repository.

### Phase 2: operational screen map

- Customers, suppliers, leads, opportunities, contacts, campaigns, sales teams, quotations, sales orders, sales invoices, returns/credit-note previews, price lists and recurring billing.
- Purchase requests, RFQs, supplier quotes, purchase orders, goods receiving, supplier bills, supplier returns, expense and payment previews.
- Warehouses, batch/serial/expiry tracking, stock counts/transfers, picklists, packages and delivery tracking, bundles, replenishment.
- POS cash-up, accounts and journal/COA previews, budgets, cost centres, bank reconciliation, fixed assets, tax-code/EFRIS readiness.
- Employees, attendance, leave, payroll and timesheet previews; projects, tasks and support; BOMs, work orders, job cards and quality inspection; team/access, audit and integration status.

All these phase-2 operations screens use the separate preview-data service. They do not write to the existing local sales/stock ledger or to the existing backend/database.

## Phase 3: mock-data service contract

Acceptance criteria:

1. Every preview register reads/writes via `PreviewDataService`; components do not own a separate persistence implementation.
2. Scope key is workspace + branch + module; data cannot leak into a different branch/workspace or into the core Dexie tables.
3. Browser localStorage persistence is detected accurately. If storage is unavailable, the UI remains usable for the session and labels memory-only data honestly.
4. Seed/sample data is only a fallback for an empty/invalid preview register; reset samples is an explicit action.
5. Calculation rules are pure functions shared by live form estimates and saved records.
6. Related document actions create reviewable *drafts*, never post inventory, accounting, tax, payment-provider, email, identity or carrier actions.

Implemented in this increment: injectable preview service, multi-line document lines for quotations/sales orders/sales invoices/purchase orders/supplier invoices/supplier quotations/returns/recurring documents, pure line subtotal + tax + discount calculations, next-period reporting, corrected issued-invoice filters, and ageing across older open documents.

## Phase 4: validation and acceptance

### Automated checks to run in CI / Vercel-capable environment

- `pnpm typecheck`
- `pnpm test`
- `pnpm lint`
- `pnpm build`
- `pnpm test:e2e` (install Chromium first)

The repository currently has no committed `pnpm-lock.yaml`; resolve it in a registry-enabled environment before claiming fully reproducible dependency resolution.

### Acceptance scenarios

1. First visit → create workspace → load branch → reach dashboard; return to onboarding → open saved workspace without duplicating it.
2. Create/edit/deactivate product; duplicate SKU and barcode are rejected; optional metadata can be cleared.
3. Opening stock is recorded once; negative stock is rejected; sale creates receipt/payment/line/movement entries atomically; partial return creates reversal and optional refund records without deleting the sale.
4. Multi-line quote / invoice / PO / supplier bill: add/remove lines, compute subtotal, discount, tax, total and remaining balance; reject blank descriptions, nonpositive quantities, invalid rates/dates and over-receipt.
5. Each preview screen supports search/status/date filters, safe pagination, detail dialog, edit, supported status transition, CSV export, reset samples and empty/error/loading states.
6. Reports derive from selected scoped mock records, use a labelled date range, include older open invoices in ageing, exclude unissued drafts from sales, and never masquerade as financial/statutory ledger output.
7. Mobile viewport (390 px) can open navigation and complete one core workflow without horizontal page overflow; wide tables scroll inside their own containers.
8. Mock entries stay isolated from real API/database settings; the integration register shows missing mapping/configuration instead of claiming a real test passed.

## Remaining intentionally unintegrated capabilities

- Real backend API/auth adapter, permission enforcement, server-side workspace/branch isolation, durable multi-user data and cross-device sync.
- Actual purchase receipt / stock ledger posting, document-to-ledger accounting, balanced journal validation by debit/credit totals, bank feeds, mobile-money/payment initiation, carrier events, email sending, EFRIS/URA submission, statutory payroll/tax, scheduling and live integration health checks.
- Multi-line document preview is UI-only and uses simple common document-level tax/discount. Live integration must map line IDs, tax code per line, rounding, tax-inclusive pricing, price lists, currency precision, and backend-approved state transitions to the authoritative API.

These boundaries must remain visible until each actual API contract is implemented and tested.
