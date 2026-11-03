# LEXA Phase 2 — module inventory, form map, figures and workflows

**Prepared:** 28 October 2026  
**Scope:** Frontend implementation plan expressed as working preview UI. The production backend and database already exist and are deliberately not changed by this patch.

## What was verified in the existing repository

The current React + TypeScript + Vite starter contains these working frontend screens: Overview/Dashboard, Business & Branches, Products, Inventory, Checkout/POS, Sales & Receipts (including receipt details and recorded returns), Settings, and Onboarding. The current shell and core workflows use the existing repository/provider layer and browser-local IndexedDB. This patch retains those core modules and their current data behaviour.

The following newly added screens are **interface previews**, not newly discovered backend endpoints. Their seeded records are fictional test fixtures. New Phase 2 module records use the separate `localStorage` prefix `lexa.phase2.preview.v1`; they do not mutate the core IndexedDB records or the external backend/database. The preview forms currently accept money in major currency units (for readability) and save draft fixture values as strings; before integration, values must be normalized to the existing API's amount convention (the current core money domain uses integer minor units). Do not send these preview records directly to production endpoints.

## New module inventory

### Selling and customer management

- **Customers** (`/modules/customers`): customer code, customer/business name, individual/company/institution type, phone, email, TIN/tax reference, billing address, credit limit, opening balance, payment terms and status. List includes contact, outstanding balance and credit limit.
- **Quotations** (`/modules/quotations`): quotation reference, customer, issue/expiry dates, description, quantity, unit price, discount percent, tax rate and status. Live preview calculations: subtotal, discount, tax estimate and total.
- **Sales orders** (`/modules/sales-orders`): order reference, customer, order and expected-delivery dates, description, quantity, unit selling price, discount, tax and fulfilment status. Calculates a draft commercial estimate only; no stock reservation or accounting post.
- **Sales invoices** (`/modules/sales-invoices`): invoice reference, customer, source sales-order reference, issue and due dates, description, quantity, unit price, tax rate, amount received and status. Calculates subtotal, tax, total and amount due. These are not statutory invoices and do not create receivables in the real ledger.

### Procurement and supplier management

- **Purchase requests** (`/modules/purchase-requests`): requester, branch/cost centre, required date, item/service, quantity, priority, suggested supplier, justification and approval status. Approval can seed an RFQ draft.
- **Requests for quotation** (`/modules/rfqs`): RFQ reference, linked request, issue/response dates, requirement, quantity, supplier invited, delivery location and terms. This preview does not send supplier emails.
- **Supplier quotations** (`/modules/supplier-quotes`): supplier/RFQ reference, quote/validity dates, quantity, unit cost, tax treatment, lead time and payment terms. Calculates a one-line estimate and can seed a purchase-order draft after acceptance.
- **Suppliers** (`/modules/suppliers`): supplier code/name, phone, email, TIN, address, payment terms, opening payable and status.
- **Purchase orders** (`/modules/purchases`): PO reference, supplier, order and expected dates, item summary, quantity, unit cost, tax, amount paid and status. Calculates subtotal, tax, total and estimated outstanding amount.
- **Supplier invoices** (`/modules/purchase-invoices`): supplier bill reference, supplier, PO reference, bill and due dates, item summary, billed quantity, unit cost, tax, amount paid and status. Calculates total and amount due.
- **Goods receiving** (`/modules/receiving`): receipt reference, PO, supplier, receipt date, product/item, ordered quantity, accepted quantity, rejected/damaged quantity, receiving warehouse, optional batch/lot and expiry date. Validation prevents a preview receipt from exceeding the ordered quantity and requires a positive accepted or rejected amount.

### Inventory, logistics and fulfilment

- **Warehouses & locations** (`/modules/warehouses`): location code/name, branch, location type, address/zone, aisle/rack/bin range, optional capacity and supervisor. This is a location register preview, not a stock sub-ledger.
- **Deliveries & fulfilment** (`/modules/deliveries`): delivery reference, sales order, customer/address, dispatch/arrival dates, courier/driver, tracking/proof reference, fee, delivery method and status. Status transitions are UI-only and do not fulfil orders or move stock.
- **Price lists & pricing** (`/modules/price-lists`): list code/name, audience, customer group, product/category, currency, reference price, sale price, discount and valid dates. Prices do not alter the existing POS.
- **Products and Inventory** remain the original screens; they are not replaced by demo versions.
- **Stock counts** (`/modules/stock-counts`): count reference/date, product, system quantity, physically counted quantity, reason and status. Calculates quantity variance; does not post an adjustment.
- **Stock transfers** (`/modules/stock-transfers`): transfer reference, source and destination branch, date, product/SKU, quantity, reason and status. Validates positive quantity and different source/destination branches; it does not create paired stock ledger movements.

### Finance, accounts and compliance readiness

- **Expenses** (`/modules/expenses`): expense reference/date, category, payee/vendor, account, receipt/invoice reference, amount before tax, tax rate and notes. Calculates tax estimate and gross estimate.
- **Money accounts** (`/modules/money-accounts`): account name/type, account/wallet reference, currency, opening/current balance preview, branch and status. Current balance is an editable sample value, not a live bank/wallet balance.
- **Receipts & payments** (`/modules/payments`): payment reference, money-in/out/internal-transfer direction, party type/name, date, method, cash/bank/wallet account, external reference, amount, allocation notes and status. Validates positive amount. No transfer is initiated.
- **Accounting journals** (`/modules/accounting`): journal reference, posting date, narration, debit account, credit account, amount, supporting reference and status. The first preview supports one paired debit/credit amount, validates positive value and distinct accounts, and shows debit equal to credit. Production will need multi-line journals, chart-of-account validation, fiscal periods, dimensions and posting permissions.
- **Chart of accounts** (`/modules/chart-of-accounts`): account code/name, account class, normal balance, parent/control account, reconciliation setting, purpose and status. It supplies a preview chart only; journals do not yet validate against it.
- **Tax codes & rules** (`/modules/tax-codes`): code/name, tax treatment, rate, sales/purchase applicability, inclusive/exclusive price basis, effective dates, input/output-tax accounts and exemption note. This is configuration preview, not a legal tax engine or URA integration.
- **Bank reconciliation** (`/modules/bank-reconciliation`): bank/account statement reference and date, opening/closing statement balances, book balance, statement/matched/unmatched line counts and difference. Reconciliation data is manually entered sample data; no bank feed or automatic matching exists.
- **Fixed assets** (`/modules/assets`): asset tag/name/category/location/date, acquisition cost, residual value, useful life, accumulated depreciation and asset account. Calculates a straight-line annual estimate and carrying value. It does not post depreciation.
- **Tax documents & EFRIS** (`/modules/tax-documents`): internal reference, source invoice, customer TIN, date, taxable amount, tax-rate estimate, external receipt/invoice number, verification code, tax/exemption notes and workflow status. This is integration-ready UI scaffolding only; it never connects to URA or asserts a fiscalized document exists.

### People, reporting and administration

- **Employees & HR directory** (`/modules/employees`): employee number/name, email, phone, department, title, branch, start date, engagement type, base-pay reference and status. Does not create an authentication account.
- **Attendance & shifts** (`/modules/attendance`): reference, employee, date, shift, clock-in/out, unpaid break, exception note and calculated working-hours estimate. This is not a verified time clock; overnight shifts need a fuller policy.
- **Payroll run preview** (`/modules/payroll`): payroll reference/period, employee count, entered gross pay/deductions, prepared-by and review reference; calculates gross minus deductions for a net estimate only. No PAYE/NSSF/statutory calculation, payslip, payment or accounting post is performed.
- **Reports & analytics (`/modules/reports`): selectable report family (sales/receipts, sales returns/discounts, stock, purchases/payables, receivables ageing, payables ageing, expenses, P&L preview, balance sheet preview, tax summary preview, attendance, deliveries, bank reconciliation and cash/accounts), period (today, 7/30/90 days, year-to-date), period-responsive illustrative bars, headline examples and CSV export. All numbers are explicitly marked sample values; they are not calculated from the live database.
- **Team & access** (`/modules/team`): name, work email, proposed role, branch scope, last-active date and member status. Does not invite users or enforce permissions.
- **Activity & audit log** (`/modules/audit`): read-only sample date/time, actor, action, record type, reference and detail. It is not a security audit log; production audit events must be generated by trusted server-side actions.

## Shared UI behaviour delivered by the preview screens

- Expanded grouped sidebar navigation and a searchable module directory, including selling/pricing, inventory/warehousing, logistics, procurement, people/payroll, finance controls, reporting and administration.
- Search over visible record fields, status filtering and date-range filters where a primary date exists.
- Responsive, horizontally scrollable data tables, 10/25/50-row pagination and matching-record counts.
- Create/edit dialogs, detail dialogs, keyboard Escape close, close/cancel actions and toast feedback. Selected preview records can seed linked draft records (customer → quote, supplier → PO, accepted quote → order, fulfilled order → invoice, order → delivery, PO → receiving/supplier bill, invoice/bill/approved expense → payment draft). These links stay in the preview store and never post stock or accounting transactions.
- Required fields, numeric minimums, transaction-specific cross-field/date validation, calculated value panels, sample status transitions and CSV export.
- A reset-sample action scoped only to the preview module's own local storage key.
- Branch/workspace labels remain visible for context. The current preview key is scoped by workspace, branch and module.
- Dashboard retains the original sales/receipt/stock figures from the existing local reporting provider and adds quick links to the expanded modules. Report-centre figures are labelled illustrative and are not mixed into core dashboard KPIs.

## Important business rules represented in the UI

1. A purchase order is a supplier commitment; it is not proof of receipt, not itself a stock movement, and not itself the supplier payable. A goods receipt records physical accepted/rejected quantities; the supplier invoice creates the bill/payable and a payment records settlement.
2. A sales order/quotation is not automatically a posted invoice or completed cash receipt. An invoice's amount due must be calculated from the total less allocated receipts.
3. Stock balances should continue to derive from the existing stock-movement ledger. A stock count or transfer must eventually create controlled ledger entries, not merely edit a quantity field.
4. Money-account balances, payment records and journal previews must not be passed off as live financial figures. A payment entry represents an event; recorded details do not prove an external bank/mobile-money transfer succeeded.
5. In accounting, debits must equal credits. Operational sales, procurement and payment documents should drive routine accounting; journals are for controlled adjustments, not as a substitute for ordinary source transactions.
6. Uganda Revenue Authority describes EFRIS system-to-system API integration for computerized ERP/POS systems. The EFRIS module in this frontend only prepares the screen and fields; API credentials, request/response formats, legal/tax rules, receipt identifiers, verification and rejection handling must be confirmed against the existing backend and URA requirements before any real submission.

## Integration contract for the later phase

When the owner authorizes frontend integration, map each form/list to the existing API/database through the existing repository/provider boundary. Confirm existing API routes, auth/session lifecycle, data ownership, schemas, enums, tax configuration, decimal/minor-unit convention, error shapes, pagination, file upload, idempotency, audit trail and permissions first. Replace the preview adapter behind each module with an API adapter rather than merging its `localStorage` fixtures into production records. Keep server-owned financial, inventory, tax and permission checks authoritative.

## External research used to shape the workflow

- Frappe/ERPNext, *Introduction to Buying Module*: a purchase order is a commitment; purchase receipt records goods and affects stock; purchase invoice records the payable; payment entry settles it. https://docs.frappe.io/erpnext/buying
- Frappe/ERPNext, *Purchase Receipt*: supports partial receipts and separates receipt from supplier payable. https://docs.frappe.io/erpnext/purchase-receipt
- Frappe/ERPNext, *Payment Entry*: distinguishes customer receipts, supplier payments, advances and internal money transfers. https://docs.frappe.io/erpnext/payment-entry
- Frappe/ERPNext, *Journal Entry* and *Accounting Entries*: balances debits/credits and reserves journals for deliberate adjustments rather than replacing ordinary source documents. https://docs.frappe.io/erpnext/journal-entry and https://docs.frappe.io/erpnext/accounting-entries
- Uganda Revenue Authority, *EFRIS*: documents the system-to-system API option for computerized accounting systems, ERP and POS. This frontend does not implement that API. https://ura.go.ug/en/efris/

The sources above are workflow research, not a claim that LEXA uses ERPNext or that its backend schema matches ERPNext. LEXA's actual backend contract remains to be inspected before integration.

Tax preview note: the default 18% rate is an editable demonstration of Uganda's standard-rated VAT rate, not a universal tax rule. URA also distinguishes zero-rated and exempt supplies. Production setup should use explicit tax codes and backend-validated rules, including inclusivity, exemptions, input-tax treatment and any applicable special rates. See URA's current overview: https://ura.go.ug/en/value-added-tax-vat/.


## Phase 2 acceptance checklist

Before this patch is considered ready for backend integration, verify in the Vercel preview:

1. Core screens still load: dashboard, business/branches, checkout, products, inventory, sales, sale detail/return, and settings.
2. Every `/modules/:moduleId` entry appears in the searchable directory and has a valid page; unknown module IDs return to `/modules`.
3. Create, edit, detail, status transition, close/cancel and Escape-key actions work on preview registers; required fields and unique reference checks block invalid entries.
4. Search, status, date-range filters, matching count, pagination size and CSV export operate on the selected module.
5. Calculations and cross-field validations behave as labelled: invoice totals/due, purchase estimates, tax treatment, receiving quantity cap, stock-count variance, different transfer endpoints, journal account pair, bank-reconciliation difference, asset depreciation estimate, attendance hours and payroll net estimate.
6. Related-document actions create **draft preview records only**; they must not post inventory movements, receivables/payables, accounting journals, actual payments or EFRIS documents.
7. The existing dashboard values continue to originate from the current reporting provider. Preview-module fixtures never inflate live dashboard numbers.
8. Verify touch layouts and narrow viewport interactions for sidebar navigation, table overflow, filter wrapping, form controls and dialogs.
9. Run `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm test:e2e` in an environment with installed dependencies; inspect the Vercel result after the ZIP-extractor workflow commits this patch.
10. During the later integration phase, map these screen contracts to the existing backend API and test permissions, idempotency, concurrency, authoritative tax/stock/accounting calculations, and server-generated audit records.

## Build and integration boundary

The patch adds no backend routes, schema migrations, secrets, environment variables or database records. It uses the existing project dependencies and component/CSS conventions. Module preview storage is a distinct browser-local namespace by active workspace and branch; this is solely for frontend review and should be replaced by API-backed repositories during integration, not migrated into business records automatically.
