# LEXA module completion and interconnection audit

Research review date: 28 October 2026. This is an implementation/acceptance record for the current LEXA frontend; it is not a claim that live ERP posting or external provider integrations are complete.

## Current architecture and honest boundary

The current frontend has seven existing core-workflow links (dashboard, workspace/branches, checkout/POS, sales/returns, products, inventory, and settings), plus 56 operational preview modules and a separate report centre. The preview modules use a separate `PreviewDataService` scoped by workspace and branch. Core product, stock, completed sale and return operations remain in the existing typed repositories and Dexie transactions.

This patch extends the preview workflow graph and source-reference metadata. Related actions create separate local preview drafts, not live postings. It does not wire preview modules into the production API, does not synchronize users/devices, does not initiate payments, and does not submit tax data or payroll to authorities/providers. A browser-local preview activity note is not a security audit trail.

## What the implementation adds

- A single graph of allowed module hand-offs instead of a short list of unrelated per-screen actions.
- Status-aware actions for lead/opportunity/quotation/order/fulfilment/invoice/receipt and purchase-request/RFQ/supplier-quote/purchase/receiving/bill flows, with duplicate guards on one-to-one lead→opportunity, won-opportunity→order, accepted-quotation→order, approved-request→RFQ, and accepted-supplier-quote→purchase conversions.
- Connections across CRM and campaigns; inventory planning and warehouse controls; manufacturing/BOM/work-orders/job cards/quality/batches; projects/tasks/timesheets/expenses/budgets/cost centres; employees/attendance/leave/payroll/payment preparation; money accounts/payments/bank reconciliation; tax-code/tax-document readiness; and support follow-up.
- Generic, target-field-aware source mapping for hand-offs without an existing specialised mapper; current specialised mappings remain authoritative.
- `sourceModuleId`, `sourceRecordId`, and human-readable `sourceReference` on related drafts.
- Local preview activity notes for related draft creation, with an explicit warning that these are not trusted server audit events.
- A strict fix for the Vercel build error: `PreviewModuleSeed` has no `title` property; validation messages now use its existing `id` field.
- Unit tests that assert every module participates in the relationship graph, core flows exist, and amount/status gates operate.


## Module-by-module completion inventory

Every module below is routed through the shared register framework: workspace/branch-scoped preview persistence, field validation, detail review, editable fields where allowed, status transitions, search/status/date filtering, pagination, CSV export, and a source-linked review-note path. Document modules additionally use the existing multi-line editor where configured; accounting journals use balanced-line validation; BOMs and bundles use structured component validation/calculation; reports use a separate aggregate preview snapshot. `audit` is read-only for direct user edits but can receive generated local preview review notes.

| Area | Modules and primary connections |
|---|---|
| Customer, sales and CRM | **Customers**, **Contacts & addresses**, **Leads & prospect tracking**, **CRM opportunities**, **Campaigns & acquisition**, **Sales team & territories**, **Price lists & pricing**, **Quotations**, **Sales orders**, **Sales invoices**, **Sales returns & credit notes**, **Recurring billing schedules**, **Customer support cases**. The shared graph prepares linked drafts from contact/lead/campaign to deal, quote, order, fulfilment, invoice, receipt, return and follow-up records. |
| Supplier, procurement and warehouse | **Suppliers**, **Purchase requests**, **Requests for quotation**, **Supplier quotations**, **Purchase orders**, **Goods receiving**, **Supplier invoices**, **Supplier returns & debit notes**, **Warehouses & locations**, **Stock counts**, **Stock transfers**, **Reorder planning**, **Warehouse picklists**, **Packages & packing slips**, **Deliveries & fulfilment**, **Batch, serial & expiry tracking**, **Quality inspections**. The graph maps a draft request-to-quote-to-order-to-receipt/bill flow and adds stock/quality follow-up links. |
| Production and fulfilment | **Bills of materials / recipes**, **Item bundles & composite items**, **Production & assembly orders**, **Production job cards**, **Quality inspections**, **Batch, serial & expiry tracking**, **Warehouse picklists**, **Packages & packing slips**, **Deliveries & fulfilment**. BOM/bundle estimates can prepare work orders, work orders can prepare job cards/time/inspection records, and inspection/batch data remain non-posting previews. |
| Finance and compliance readiness | **Expenses**, **Money accounts**, **Receipts & payments**, **Accounting journals**, **Fixed assets**, **Chart of accounts**, **Tax codes & rules**, **Tax documents & EFRIS**, **Bank reconciliation**, **Cost centres**, **Budgets & forecasts**, **POS sessions & cash-up**. Related actions prepare payments, reconciliation, tax-readiness, project and budgeting records; they do not initiate transfers or post a live GL. |
| People, projects and administration | **Team & access**, **Employees & HR directory**, **Attendance & shifts**, **Payroll run preview**, **Leave requests**, **Projects & cost tracking**, **Tasks & work queue**, **Timesheets & billable time**, **Integration status**, **Activity & audit log**. Employee/time/leave/payroll flows are review drafts only; integration errors can create support follow-up, and audit notes are local preview-only. |
| Reporting | **Reports & analytics** is the separate report centre, not a `MODULE_CATALOG` CRUD entry. It aggregates preview datasets for the selected report and reporting period and supports CSV export. |

**Shared module acceptance** means that a source module has at least one permitted hand-off and every target exists in the catalog; the edge has a clear user-facing label/explanation; configured statuses and positive outstanding-value gates are respected; a hand-off writes a separate draft with `sourceModuleId`, `sourceRecordId` and `sourceReference`; and the core ledgers remain unchanged. The automated graph tests assert the catalog IDs, required cross-module flows, status/amount gates and no-dead-end review-note paths.


## Complete catalog-key checklist

The production-grade status and implementation boundary is recorded in the “Live production integration still required” column of the workflow matrix above. The table below explicitly lists every current `MODULE_CATALOG` entry (56 of 56). Every writable entry has the common preview CRUD/filter/export behaviour and a source-linked review-note action; additional edges are status-gated and are shown only when their edge rules match. `audit` is the sole read-only module and receives local preview notes.

| Catalog key | Module screen | Workflow area |
|---|---|---|
| `customers` | Customers | Selling / CRM |
| `suppliers` | Suppliers | Procurement |
| `sales-orders` | Sales orders | Selling / fulfilment |
| `sales-invoices` | Sales invoices | Selling / receivables |
| `quotations` | Quotations | Selling / CRM |
| `purchases` | Purchase orders | Procure-to-pay |
| `purchase-invoices` | Supplier invoices | Procure-to-pay / payables |
| `receiving` | Goods receiving | Warehouse / purchasing |
| `expenses` | Expenses | Finance / projects |
| `money-accounts` | Money accounts | Cash / banking |
| `payments` | Receipts & payments | Cash / banking |
| `accounting` | Accounting journals | Finance controls |
| `assets` | Fixed assets | Finance / assets |
| `stock-counts` | Stock counts | Inventory controls |
| `tax-documents` | Tax documents & EFRIS | Tax readiness |
| `stock-transfers` | Stock transfers | Inventory controls |
| `team` | Team & access | Administration / identity preview |
| `price-lists` | Price lists & pricing | Selling |
| `deliveries` | Deliveries & fulfilment | Order-to-cash |
| `warehouses` | Warehouses & locations | Inventory |
| `employees` | Employees & HR directory | People / HR |
| `attendance` | Attendance & shifts | People / HR |
| `payroll` | Payroll run preview | People / payroll |
| `chart-of-accounts` | Chart of accounts | Finance controls |
| `tax-codes` | Tax codes & rules | Tax readiness |
| `bank-reconciliation` | Bank reconciliation | Cash / banking |
| `purchase-requests` | Purchase requests | Procurement |
| `rfqs` | Requests for quotation | Procurement |
| `supplier-quotes` | Supplier quotations | Procurement |
| `audit` | Activity & audit log | Administration / local preview notes |
| `opportunities` | CRM opportunities | CRM / selling |
| `sales-returns` | Sales returns & credit notes | Selling / returns |
| `purchase-returns` | Supplier returns & debit notes | Procurement / returns |
| `projects` | Projects & cost tracking | Projects / costing |
| `tasks` | Tasks & work queue | Operations / tasks |
| `support` | Customer support cases | Support |
| `work-orders` | Production & assembly orders | Manufacturing |
| `quality` | Quality inspections | Quality / inventory |
| `batches` | Batch, serial & expiry tracking | Inventory traceability |
| `leads` | Leads & prospect tracking | CRM |
| `cash-sessions` | POS sessions & cash-up | POS / cash control |
| `boms` | Bills of materials / recipes | Manufacturing |
| `job-cards` | Production job cards | Manufacturing / labour |
| `leave` | Leave requests | People / HR |
| `replenishment` | Reorder planning | Inventory planning |
| `packages` | Packages & packing slips | Fulfilment |
| `contacts` | Contacts & addresses | CRM |
| `campaigns` | Campaigns & acquisition | CRM / marketing |
| `sales-teams` | Sales team & territories | CRM / selling |
| `item-bundles` | Item bundles & composite items | Inventory / manufacturing |
| `picklists` | Warehouse picklists | Fulfilment / warehouse |
| `cost-centers` | Cost centres | Finance / projects |
| `budgets` | Budgets & forecasts | Finance / projects |
| `integrations` | Integration status | Integration readiness |
| `recurring-invoices` | Recurring billing schedules | Selling / receivables |
| `timesheets` | Timesheets & billable time | Projects / labour |
| Separate `REPORT_MODULE` | Reports & analytics | Preview report centre (period-filtered aggregates and CSV export) |

## Workflow acceptance map

| Business area | Preview flow to verify | Live production integration still required |
|---|---|---|
| Customer-to-cash | Customer/contact → quotation → sales order → pick/pack/delivery → sales invoice → receipt → bank reconciliation | Real customer/product API, fulfilment and stock posting, invoice issuance, payment matching and GL posting |
| Supplier-to-pay | Purchase request → RFQ → supplier quote → purchase order → goods receipt → quality/batch review → supplier invoice → payment | Supplier API, warehouse receipts, invoice matching, payment rails and payable/GL posting |
| Inventory controls | Warehouse → stock count/transfer/replenishment; receipt/batch → quality | Inventory reservations, stock movements, valuation/costing, batch/serial allocation and atomic ledger transactions |
| CRM | Campaign/contact → lead → opportunity → quote/order | Real email/communication provider, ownership/permissions, conversion API, uniqueness and audit trail |
| Manufacturing | BOM/bundle → work order → job card/time → quality → batch | Structured item master, material consumption, WIP/finished-good movements, costing and production reservations |
| Projects and cost | Project → tasks/timesheets/expenses/budgets/cost centres | Posting rules, time approval, billing, cost allocations and financial reports against the ledger |
| People | Employee → attendance/leave → payroll review → payment preparation | HR master API, country-specific statutory calculations, approvals, payslips, bank/mobile-money integration and legal retention |
| Finance controls | Chart of accounts/tax codes → review documents; payments/cash-up/money accounts → bank reconciliation | Controlled account mappings, balanced GL posting, bank feed, reconciliation matching, period locks and audit permissions |
| Tax compliance | Invoice/bill/tax code → tax-document readiness | Current URA/EFRIS specification, credential storage on server, signed request handling, idempotency, error recovery and end-to-end sandbox certification |
| Support/integration | Case → follow-up task/contact; integration exception → support case | Actual helpdesk, email/SMS delivery, connector health checks, retry queues and server-side logs |

## Design rules enforced

1. A related action creates a separate record and retains its originating source module, record ID, and reference.
2. Status-sensitive conversions are shown only at appropriate points in the lifecycle; a zero outstanding amount does not offer a receipt/payment action.
3. Routine financial events are not silently journal-posted from generic preview actions. Posting requires a separately implemented and tested API/domain service with balanced debits/credits.
4. Product, sales, stock and returns in the existing core local repository are not modified by preview actions.
5. A successful frontend build is not proof that credentials, multi-user access, server permissions, or external integrations work.

## External references consulted

- ERPNext Selling documentation describes customer, quotation, order, invoice, pricing and reports as a connected order-to-cash workflow: https://docs.frappe.io/erpnext/selling
- ERPNext Sales Order documentation describes the standard sequence Quotation → Sales Order → Delivery Note → Sales Invoice → Payment Entry and variants: https://docs.frappe.io/erpnext/sales-order
- ERPNext Accounting Entries describes the journal effects of submitted sales, payment, receipt, supplier invoice and adjustment documents, including balanced debit/credit requirements: https://docs.frappe.io/erpnext/accounting-entries
- ERPNext Accounting Introduction documents receivables/payables ageing, sales/purchase registers, bank reconciliation, taxes and financial statements based on submitted ledger data: https://docs.frappe.io/erpnext/accounting-introduction
- Microsoft Dynamics 365 inventory-to-deliver guidance shows inventory as part of a connected end-to-end business process: https://learn.microsoft.com/en-us/dynamics365/guidance/business-processes/inventory-to-deliver-overview
- Microsoft Dynamics 365 Business Central integration documentation describes sharing stock/pricing, synchronizing sales orders for fulfilment/invoicing, and showing credit/invoice context to sales: https://learn.microsoft.com/en-us/dynamics365/business-central/integration-overview
- Zoho Inventory documents batch tracking through receipt, invoice, transfers, adjustments and batch history, including tracing which invoices consumed a batch: https://www.zoho.com/us/inventory/help/advanced-inventory-tracking/batch-tracking.html
- Zoho Inventory barcode documentation describes SKU/EAN/UPC, serial and batch identifiers as item-selection/traceability mechanisms: https://www.zoho.com/us/inventory/help/items/qrcode-generation.html


- ERPNext Manufacturing documentation links BOMs, work orders, job cards, stock/WIP and quality checks in a coordinated production process: https://docs.frappe.io/erpnext/manufacturing
- ERPNext Work Order documentation explains material requirements derived from the BOM and the production/job-card flow: https://docs.frappe.io/erpnext/work-order
- ERPNext Job Card documentation describes operation/workstation and labour-time capture against production: https://docs.frappe.io/erpnext/job-card
- ERPNext project-costing and timesheet documentation describes how time and expense entries can feed project costing/billing: https://docs.frappe.io/erpnext/project-costing and https://docs.frappe.io/erpnext/timesheets
- Frappe HR attendance documentation describes attendance as an employee/shift-linked input, while the HR introduction describes the wider leave/attendance/payroll lifecycle: https://docs.frappe.io/hr/attendance and https://docs.frappe.io/hr/introduction
- ERPNext accounting-report documentation emphasizes report dimensions and fiscal/date context over posted ledger data: https://docs.frappe.io/erpnext/accounting-reports


## Build and dependency-install policy

The supplied Vercel log also reports an npm `install-scripts` warning for `esbuild@0.28.2`. The patch records a version-specific approval for that package script in `package.json` instead of enabling install scripts globally. npm's documentation describes `allowScripts` as the package-level control for reviewed install-time scripts and supports version-specific decisions; esbuild is the platform-aware bundler used by Vite. The workflow verifies the approval before installing packages. This is separate from the original TypeScript compilation error and does not replace a reproducible lockfile or a complete successful build/test run.

References: [npm install-script approvals](https://docs.npmjs.com/cli/v11/commands/npm-install-scripts/), [npm allow-scripts configuration](https://docs.npmjs.com/cli/using-npm/config/#allow-scripts), [esbuild package](https://www.npmjs.com/package/esbuild).

## Verification plan

The new GitHub Actions workflow is deliberately manual. After the ZIP is extracted to the repository, run **Actions → Complete LEXA preview workflows → Run workflow** on `main`. It applies guarded transformations, installs dependencies, runs `npm run build`, runs `npm test`, checks whitespace, and pushes the changes only if build and tests pass. Vercel should then deploy the new `main` commit. If any test fails, read the workflow logs before treating the build as fixed.
