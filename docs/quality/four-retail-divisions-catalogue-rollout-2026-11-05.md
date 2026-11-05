# LEXA — four retail divisions: specialized inventory release

Date: 5 November 2026. Scope: **13 existing LEXA industries remain supported**. Phones, accessories, electronics and appliances are distinct product-entry experiences within the existing mobile-phones, electronics and household-goods industries. This source package does not seed manufacturers, SKUs, stock, IMEIs or customer transactions.

## Delivered source changes

- Catalogue contract v2: 51 product presets and 146 suggested category paths, with separate required fields and tracking for 17 new device, accessory, electronics and appliance subtypes. The same manifest generates frontend and backend policy data and the API reports its generated version.
- Guided frontend division filters (Phones, Accessories, Electronics, Appliances), brand/model selection, custom brand and model registration, category hierarchy, variants and existing stock receiving actions.
- **Tenant-owned manufacturer/brand and device model registry.** Names are normalized for uniqueness. Model IDs can be attached to products, with API-level tenant, brand, and product-type validation. Existing product IDs, free-text brand values and historic products remain valid.
- **Verified accessory fitment.** Proposed accessory-to-model links are kept separate from inventory-approver verification. POS suggestions use only verified links and require actual branch availability; no fit is inferred from a similar name.
- **Serialized-unit inspections and history.** Immutable condition events (new/open box/used/refurbished/damaged) and optional measured battery health. Scan IMEI or serial to locate the exact unit, with authorized stock movements, sales and return references. No customer contact details are exposed by the stock-history endpoint.
- **Fail-closed damaged-unit handling.** Core checkout and a database trigger block sale, reservation and in-transit allocation of an item whose latest inspection is damaged; a manager/inventory approver must clear the recorded damaged state. This is not a substitute for an approved stock quarantine operation.
- **Sale-time warranty duration snapshot.** New sale lines record a validated warranty-month value, and receipts expose it without rewriting historic receipts. This is a recorded business promise, not automatic manufacturer warranty validation or legal certification.
- New tenant-scoped Prisma data models and **one additive PostgreSQL migration**: `20261105090000_specialized_devices_brands_compatibility`. Existing migrations remain unchanged. New tables are included in the authoritative backup inventory.
- Ten new brand/model/fitment/inspection API operations plus exact-unit lifecycle lookup; OpenAPI and client methods are synchronized.

## Staging release sequence (mandatory before production)

1. Confirm the GitHub import is based on the current `main`, upload this ZIP **alone**, and require the import workflow's backend Nest build and frontend Vite build to be green.
2. Create a fresh, verified full database backup and a **non-production Neon branch**. Apply all pending Prisma migrations on that branch, using the migration-only DB connection.
3. Validate `catalog_brands`, `catalog_device_models`, `accessory_compatibilities`, `inventory_unit_inspections` and `sale_lines.warranty_months_snapshot` existence; test RLS, actor role restrictions, unique names, cross-tenant FK rejection, and immutable inspections.
4. Test a mixed-industry owner with phone/accessory/electronics/appliance selections; retain a copy of historical products, stock, serials, receipts and finances. Confirm record IDs and counts are unchanged before and after migration.
5. Create **staging-only** real-product catalogues: one new phone model (actual IMEIs from test devices), one charger/case with **approved** model fitment, one laptop (actual serial), one refrigerator (actual serial), and variants. Test permitted/denied flows for owner, manager, cashier, warehouse and technician.
6. Receive stock from supplier purchase orders. Move exact units across warehouses, reserve, sell, refund/return, inspect and check receipts and valuation. Assert duplicate IMEIs and a damaged inspected unit cannot be sold. Check that accessory recommendations never show unverified or out-of-stock items.
7. Check background workers and import/export workflows use the same server-side product policies; verify backup/restore in the isolated branch. Reconcile stock ledger, sale lines, costs, tax, payments and return totals.
8. Deploy the verified `main` commit to Render and frontend hosting; verify ready endpoint, authenticated pages and live purchasing/checkout read-only smoke tests before any customer-facing write.

## Boundaries: do not claim full production certification from source tests

Local backend unit tests, OpenAPI consistency, route uniqueness, static TypeScript syntax and relative-import checks **cannot certify** a live multi-tenant purchase-to-sale workflow. This sandbox cannot reach the npm registry or the live authenticated staging database. A GitHub build, staging migration, real database-backed scenario tests, payment/ledger reconciliation, and authorized production smoke testing are still required. Direct GitHub writes previously returned 403 `Resource not accessible by integration`.

## Research references

- GS1 Application Identifiers: GTIN (01), batch (10), expiry (17), serial (21): https://ref.gs1.org/guidelines/2d-in-retail/1.1.0/
- GSMA multi-SIM requirements: https://imeidb.gsma.com/imei/resources/documents/TS.37-v9.0.pdf
- USB-IF connector and cable capability labelling: https://usb.org/cable_connector
