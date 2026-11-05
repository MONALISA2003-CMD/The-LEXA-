# LEXA 13-industry operational integrity — Phase C

## Decision and release status

**Status: SOURCE-LEVEL IMPLEMENTATION; NOT PRODUCTION CERTIFIED.** This release strengthens common inventory integrity across purchase receiving, packages, transfers and opening stock. It cannot be used to claim all 13 industries or all 54 LEXA module definitions are fully integrated. No database migration, staging restore, authenticated browser journey, or concurrent live checkout was executed by this build environment.

The five retired industries stay unavailable for new business setups; old product, customer, sale, lot and serial identifiers remain unchanged. Historic migrations are not edited.

## Changes installed

- A tenant-scoped `product_packages` catalogue with variant-aware package definitions. Package counts convert into **base stock units** with exact three-place decimal arithmetic (the same pure converter is on backend and frontend). Invalid fractional serial units and conversions needing rounding are rejected.
- Additive migration `20261104193000_product_packaging_receipt_identity` creates new packages and appends nullable `variant_id` to purchase receipt and transfer lines. It preserves all historical rows and maintains tenant-owned variant foreign keys and product-package RLS.
- Purchase order goods receiving uses the correct accepted/rejected quantity names, supports packages and exact variants, rejects over-receipt, captures batch identity, validates IMEI/serial identities, writes physical-unit/stock movements and goods-received-not-invoiced ledger entries within one serializable transaction.
- Warehouse transfers preserve variant identity through transfer line, source/destination lots and movement history. Unbatched serials are checked against their most recent recorded warehouse; source stock checks are now variant-specific and row locks target the serial table, not the nullable side of an outer join.
- Manual opening stock requires an inventory approver. Opening a lot books inventory and opening-equity values; stock adjustments for lot/serial products cannot silently bypass physical-unit tracking.
- Product page exposes packages; receiving page offers a variant/package selector; transfer page requires the correct variant. Other clients use the new GET/POST packages APIs documented by the OpenAPI contract.
- Backup restore integrity and inventory-table inventory include the packaging table. The new staging-audit CLI checks nine tenant-scoped invariants, without writes.

## 13 operational acceptance journeys (LIVE STAGING REQUIRED)

For each, execute **business setup → category and products → purchasing → accepted goods receipt → branch/warehouse balance → sale/fulfilment → return → finance/receipt reconciliation → backup restore** with owner/manager/cashier/warehouse/technician as appropriate, then repeat tenant-ID tampering tests.

| Industry | Live inventory/identity scenario | Mandatory finance/outcome evidence |
|---|---|---|
| Retail/supermarkets | 24 units per carton, scan GTIN, mixed expiring and non-expiring goods, FEFO/shortage | Sale, promotional tax, supplier GRNI, COGS |
| Wholesale/distribution | Receive 20 cases, sell cases and pieces to two credit customers, partial delivery | Correct base-unit stock and AR/AP balances |
| Electronics/appliances | Serialised TV by model/variant, transfer, warranty and return | Exact serial trace and reversal of inventory/COGS |
| Phones/accessories | Dual-IMEI smartphone, colour/storage variants, selling one exact device | Exact IMEI on receipt; no double-sell under concurrency |
| Fashion/shoes | Size × colour inventory matrix and exchange | Only exchanged SKUs move; net revenue/tax correct |
| Perfumes/cosmetics | Fragrance bottle sizes, cosmetic shades, expiring batch and recall | Expiry exclusion, batch traceability, sales reversal |
| Restaurants/hospitality | Menu modifier and ingredients consumed by portions | Recipe-derived ingredient and margin reporting |
| Bakery/prepared food | Daily recipe batch, ingredient consumption, 100 loaves, wastage | Batch balance, waste expense, COGS |
| Hardware/construction | Measured cables/pipes by diameter/length, rolls sold by metre | Exact three-place units, cost of offcuts |
| Household/home | Furniture materials/dimensions, multi-unit set and delivery | Stock reservation, delivery and invoicing |
| Repairs/technical | Customer-owned device, replacement part, technician, warranty case | Customer asset separated from sellable stock, part cost and service revenue |
| Education/training | ISBN/edition textbooks, size-specific uniforms, nonstock course | Mixed stock + nonstock sale and receipt |
| Other activities | Custom categories and fields, quantity/serial/batch tracking | Tenant isolation and full financial reconciliation |

**Not implemented or proven by this patch alone:** end-to-end finance integration of supplier invoices and receiving; complete return and service workflows with all exact physical identifiers; full recipe/BOM operations for every restaurant/bakery journey; all import/export adapters; measured-quantity checkout in every sales UI; replay/recovery of pre-packaging backups; live concurrency, restores, access-control browser tests and regulatory readiness. Track them as blocking acceptance tasks, not completed assertions.

## Validation gates

1. Locally `cd backend && npm ci && npm run db:generate && npm run db:validate && npm test && npm run build && npm run contract:check && npm run ledger:coverage`.
2. Locally `cd lexa-frontend && npm ci && npm run prebuild && npm run build && npm run test:e2e`.
3. Before migration take a verified database backup; rehearse `prisma migrate deploy` against an isolated staging branch, including rollback/restore from a *matching schema version* snapshot.
4. After migration run `NODE_ENV=staging LEXA_STAGING_AUDIT=YES LEXA_AUDIT_TENANT_ID=<staging tenant uuid> DATABASE_URL_UNPOOLED=<staging direct connection> npm run audit:industry-staging` in the backend. Run separately for every test tenant. The auditor is read-only and fails on negative stock, duplicate identifiers, broken reference links or invalid package definitions.
5. Verify 13 journeys above in actual UI and REST API with two tenants, multiple branches, cashier+warehouse concurrency, roles, CSV import and mobile/external clients.
6. Reconcile stock movement quantities by product/variant/warehouse and all sales, purchase receipts, GRNI, tax and inventory/COGS journal entries. No negative or duplicate stock; no unposted but sellable goods; no missing GL or historical identifiers.
7. Only after all criteria and deployment smoke tests pass can an industry be marked **business-ready**.

## Migration safety notes

- New tables/columns are additive, and existing identifiers/rows are not rewritten. Any migration failure must stop startup rather than attempt a destructive repair.
- For pre-Phase-C backups, do not attempt an in-place restore into Phase-C schema without a version-aware staging rehearsal. Preserve the original backup and restore into its matching historical schema first, then apply the additive migration.
- Do not rerun this ZIP import workflow by deleting an old ZIP on the same commit. Upload only one changed new root-level ZIP, let importer validate and commit source, and check the fresh GitHub Actions run.
