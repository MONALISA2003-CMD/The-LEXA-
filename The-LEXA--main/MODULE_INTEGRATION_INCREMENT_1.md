# LEXA module integration — Increment 1

## What this increment does

This is the shared backend/data foundation for all 56 module screens currently declared in `lexa-frontend/src/modules/operations/moduleCatalog.ts`.

- `module_definitions` registers each frontend module on the backend (title, singular label, group, schema version, writable flag, and storage kind).
- The existing `module_records` table remains the authoritative persistent collection for each module, partitioned logically by `(tenant_id, branch_id, module_id, record_id)`. This avoids creating 56 disconnected databases and makes a module hand-off possible within one PostgreSQL transaction boundary.
- `module_record_links` stores real, tenant- and branch-scoped relationships between records. It has foreign keys to both source and target module records, a unique edge key, and indexes for forward and reverse lookup.
- `module_domain_events` stores durable record events and an outbox state for future server-side consumers. Module saves, status changes, hand-offs, and collection operations publish events through the authenticated API.
- The existing workflow graph's `sourceModuleId` / `sourceRecordId` metadata now creates a persisted backend relationship when a related record is saved.
- Record detail screens now show connected module records and recent module activity. The panels refresh against the server; they do not use sample records.

## Module coverage

All modules below are registered and use the backend module-record API under the active workspace and branch.

| Group | Modules |
|---|---|
| Selling | Customers, Sales orders, Sales invoices, Quotations, Price lists & pricing, Opportunities, Sales returns & credit notes, POS sessions & cash-up, Recurring billing schedules |
| Procurement | Suppliers, Purchase orders, Supplier invoices, Purchase requests, Requests for quotation, Supplier quotations, Supplier returns & debit notes |
| Inventory | Goods receiving, Stock counts, Stock transfers, Warehouses & locations, Quality inspections, Batch/serial/expiry tracking, Production & assembly orders, Reorder planning, Item bundles |
| Finance | Expenses, Money accounts, Receipts & payments, Accounting journals, Fixed assets, Tax documents & EFRIS, Chart of accounts, Tax codes, Bank reconciliation, Cost centres, Budgets & forecasts |
| Logistics | Deliveries & fulfilment, Packages & packing slips, Warehouse picklists |
| People & payroll | Employees & HR directory, Attendance & shifts, Payroll runs, Leave requests, Timesheets |
| CRM | Leads, Contacts & addresses, Campaigns & acquisition, Sales team & territories |
| Administration / control | Team & access, Activity & audit log, Projects & cost tracking, Tasks & work queue, Customer support cases, Integration status, Bills of materials / recipes, Production job cards |

## Existing typed operational tables

LEXA already has typed tables and endpoints for tenants/workspaces, branches, users, memberships, products, categories, stock movements, sales, sale lines, sale payments, and sales returns/return lines. Those core ledgers remain authoritative for the flows they already support. The 56 module registers do not silently duplicate or write into those ledgers; cross-module hand-offs are separate, linked records until an approved domain workflow posts the corresponding stock, finance, or payment transaction.

## New API routes

All routes are behind the existing authenticated session and workspace/branch membership checks. Mutating routes also require the existing CSRF guard.

- `GET /api/v1/workspaces/:workspaceId/branches/:branchId/module-graph/catalog`
- `GET /api/v1/workspaces/:workspaceId/branches/:branchId/module-graph/records/:moduleId/:recordId/links`
- `POST /api/v1/workspaces/:workspaceId/branches/:branchId/module-graph/links`
- `DELETE /api/v1/workspaces/:workspaceId/branches/:branchId/module-graph/links/:linkId`
- `GET /api/v1/workspaces/:workspaceId/branches/:branchId/module-graph/events?moduleId=...&recordId=...&limit=...`
- `POST /api/v1/workspaces/:workspaceId/branches/:branchId/module-graph/events`

The existing CRUD routes remain in place:

`/api/v1/workspaces/:workspaceId/branches/:branchId/modules/:moduleId/records`

## Deployment

1. Extract the ZIP overlay at the root of `MONALISA2003-CMD/The-LEXA-` on `main`.
2. Preserve the folders and allow the included files to replace their matching counterparts.
3. Commit to `main`.
4. Render and Vercel auto-deploy from `main`. Render's Docker Command override must remain blank so `npx prisma migrate deploy` runs before the API starts.
5. Check Render `/health/ready` and confirm the `module_definitions`, `module_record_links`, and `module_domain_events` tables exist.

The migration is additive. It does not delete or rewrite existing products, sales, stock movements, customers, or other business records. The link table references existing module records; deleting a linked module record removes its links via foreign-key cascade, while the activity events remain as workspace/branch history.

## Verification after deployment

- The module graph catalog must return 56 entries.
- A saved customer record must be retrievable from `module_records` using module ID `customers`.
- Use a related action to create a quotation from that customer; the quotation should appear in the source record's **Connected business records** panel.
- The source and target records should each have a `record.linked` event.
- Updating a register record or its status should append a corresponding event visible in the **Recent module activity** panel.

## Scope boundary — what this increment does not claim

This makes module persistence, registration, record relationships, and the activity/event feed operational. It does not yet turn every business status into a stock movement, general-ledger posting, bank instruction, external payment, EFRIS submission, statutory payroll calculation, carrier request, email/SMS delivery, or other regulated/third-party side effect. Those require their own validated domain workflows and, where relevant, verified provider credentials. The next implementation increments should implement those transaction rules in bounded groups, beginning with sales/CRM and procurement/inventory, then finance, then people/payroll/manufacturing/logistics.

## Important architecture choice

A separate physical PostgreSQL database per screen would prevent consistent cross-module transactions and create unnecessary operational overhead. This increment uses one Neon database with per-module logical collections, a backend registry, relationship edges, and an event stream. Typed core ledgers stay typed; new module families can gain dedicated normalized entities in later increments without breaking the module-record contract or existing user data.
