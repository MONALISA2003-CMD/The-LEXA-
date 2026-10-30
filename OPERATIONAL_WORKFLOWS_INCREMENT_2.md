# LEXA Operational Workflows — Increment 2

## Verified starting point

Prepared against GitHub `main` commit `6be4554a5bc495e3dde5ec48c906612aa2260c62`. Before implementation, Increment 1 was confirmed applied, all 56 module definitions were seeded, Vercel and Render were live on the same commit, and the Render `/health/live` and `/health/ready` endpoints returned HTTP 200 with database dependency `ok`.

## Operational behaviour delivered in this increment

### Sales orders, CRM and fulfilment

- Create a multi-line sales order from active products and their current saved selling prices. An order can be linked to an active CRM customer record, with the customer name and branch-scoped record relationship retained.
- Record destination address, expected delivery date and courier/driver on the order.
- Confirming a draft sales order validates available stock and reserves quantities by order line. Reservation reduces *available-to-promise* stock, not the physical on-hand ledger.
- Dispatch supports partial quantities per line. A dispatch posts a core sale and sale lines, negative `sale` movements for stock-tracked products, fulfilled quantities, reservation release, fulfilment history, delivery record, module links/events and audit history in a single database transaction.
- Repeated dispatches can complete the balance of an order. Dispatch cannot exceed the outstanding line quantity or the available stock/reservation controls.
- Convert a CRM lead into a customer record. The lead is preserved and linked to the new customer; repeating the conversion returns the existing customer rather than creating a duplicate.

### Procurement and goods receiving

- Create a multi-line purchase order from active products and saved cost prices, linked to a supplier record.
- Placing an order does not change inventory. Stock changes only when a counted goods receipt is posted.
- Receipt entry supports accepted and rejected quantities by purchase-order line, plus batch/lot, expiry date, rejection note and receipt note. Multiple partial receipts are supported.
- Only accepted quantities create positive `receiving` movements in the stock ledger. Rejected quantities remain traceable on receipt lines and are not added to stock. Rejected units do not satisfy the purchase commitment, allowing replacements to be received later.
- The purchase order remains open/partially received until its ordered quantity has been accepted.

### Logistics

- Every dispatch creates a delivery record linked to its sales order and fulfilment, including recipient, destination, courier and expected delivery date.
- Operators can set a delivery in transit, record a failed attempt, retry after failure, or close it as delivered.
- A proof-of-delivery or collection reference is required before a delivery can be marked delivered. Delivery status updates never create a second stock movement; stock was issued at dispatch.

### Inventory

- Existing `stock_movements` remains the authoritative stock ledger. No separate cached on-hand quantity is introduced.
- Accepted goods receipts increase on-hand stock; dispatch decreases it. Existing Inventory balances and movement screens read these same ledger rows.
- Confirmed sales orders reserve stock by branch. Dispatch rechecks on-hand balance against outstanding reservations to prevent shipping stock that was consumed by a later stock adjustment.

## Database additions

The additive migration `20261030190000_commerce_workflows` creates ten tables:

| Table | Purpose |
|---|---|
| `commerce_sales_orders` | Sales order header, customer, destination, courier, expected date, state and total |
| `commerce_sales_order_lines` | Product/price snapshots and ordered/fulfilled quantities |
| `commerce_stock_reservations` | Confirmed order commitments against available branch stock |
| `commerce_fulfilments` | Each dispatch and its linked core sale |
| `commerce_fulfilment_lines` | Quantities dispatched per order line |
| `commerce_deliveries` | Delivery destination, courier, expected date, tracking and proof state |
| `commerce_purchase_orders` | Supplier order header, expected date, state and total |
| `commerce_purchase_order_lines` | Product/cost snapshots and accepted/rejected quantities |
| `commerce_goods_receipts` | Each counted receipt against a purchase order |
| `commerce_goods_receipt_lines` | Accepted/rejected counts, batch, expiry and rejection reason |

The migration is additive. It does not drop, truncate or rewrite existing product, sales, stock, CRM, supplier, module-record or audit tables. Existing core `sales`, `sale_lines` and `stock_movements` remain authoritative for posted sale and inventory quantities.

## API routes

All routes are under:

`/api/v1/workspaces/:workspaceId/branches/:branchId/commerce`

| Method | Route | Purpose |
|---|---|---|
| GET | `/sales-orders` | List branch sales orders and lines |
| POST | `/sales-orders` | Create a draft multi-line sales order |
| POST | `/sales-orders/:orderId/confirm` | Confirm and reserve available stock |
| POST | `/sales-orders/:orderId/fulfil` | Dispatch selected quantities and post sale/stock effects |
| GET | `/purchase-orders` | List purchase orders and receipt progress |
| POST | `/purchase-orders` | Create a draft supplier purchase order |
| POST | `/purchase-orders/:orderId/order` | Place a draft purchase order |
| POST | `/purchase-orders/:orderId/receipts` | Post accepted/rejected receipt quantities and accepted stock |
| GET | `/deliveries` | List deliveries and fulfilment links |
| PATCH | `/deliveries/:deliveryId/status` | Update transit, delivery-failure or delivered state and proof reference |
| POST | `/crm/leads/:leadRecordId/convert` | Convert a CRM lead to a linked customer record |

Mutations validate the session, active workspace membership, branch ownership and CSRF token. Posting operations use database transactions. The API rejects unavailable products, insufficient stock, over-fulfilment, duplicate or invalid receipt lines, acceptance beyond outstanding order quantity and illegal state transitions.

## Frontend workflow panels

| Screen | Connected function |
|---|---|
| Sales orders | Create, confirm/reserve, set fulfilment quantities and dispatch |
| Leads | Convert a lead into a linked customer |
| Customers | View branch-level sales-order activity and linked records |
| Purchase orders | Create and place supplier purchase orders |
| Suppliers | View branch-level purchase-order activity and linked records |
| Goods receiving | Count accepted/rejected quantities, batch and expiry details; post partial receipts |
| Inventory | Existing balance/movement views reflect accepted receipts and dispatches |
| Deliveries & fulfilment | Track destination, ETA, courier, transit, delivery failure/retry and proof of delivery |

The four transactional registers (Sales orders, Purchase orders, Goods receiving and Deliveries) are read-only in the generic editor. Their creation and status changes go through the corresponding typed workflow controls so status changes cannot bypass the stock and transaction ledgers.

## Validation performed during preparation

- Strict backend TypeScript check of the new controller passed using local type fixtures for NestJS, Fastify and Prisma contracts; the fixtures are not part of the ZIP.
- Isolated strict frontend structural/type check for the new workflow panel passed using local declaration fixtures; these fixtures are not part of the ZIP.
- TypeScript transpile/syntax checks passed for the new controller, app module, API adapter, workflow panel, module page and module catalog.
- Existing frontend build-time module completion and LEXA palette scripts both ran successfully after the new panel was added, and the panel/read-only flags remained in place.
- SQL lexical checks passed; the migration contains ten additive table definitions and no `DROP`, `TRUNCATE` or `DELETE` statements.
- ZIP integrity is checked before delivery.

A full Vite build and frontend unit suite were not run because the frontend dependency installation timed out in this environment. A complete Nest production build and live signed-in order/receipt/dispatch acceptance test were also not run. The new Increment 2 migration has **not** been applied to production by this patch preparation; Render will apply it through the existing Docker startup migration command after the ZIP is extracted and deployed.

## Scope boundaries

This increment does not create general-ledger journals, supplier invoice/payable balances, customer tax invoices, statutory tax/EFRIS submissions, supplier payment instructions, live courier API calls, bank or mobile-money transactions. Carrier status and proof are manually recorded until a verified carrier integration is connected. Stock is branch-scoped; warehouse/bin-level location balances and inter-branch transfer posting are later workflow work. External fulfilment, payment and tax effects are not simulated.
