# LEXA 13-industry business-operation release gates

**Status: source-level guards implemented; full industry production E2E certification is still required.**

## Security gates

- `role-policy.ts` is authoritative for owner, manager, cashier, stock operator, warehouse and technician actions. Technician is deliberately limited to read-only catalog/stock and their own assigned service cases; no unrestricted support, finance or stock writes.
- Branch-restricted employees must be assigned a branch; no membership or suspended membership must receive tenant data. Existing guard validates the signed session, membership and assigned branch under tenant context.
- Browser navigation is convenience only; direct HTTP and queue/import operations must apply the same policy.
- Required **live** proof: run authenticated role matrix for every role in two isolated businesses and two branches, including permission-denied responses and cross-tenant record IDs. The read-only staging harness is `node backend/scripts/smoke-tenant-roles.mjs` (see environment variables in the script). Do not use a production account for negative tests.

## Cross-client gates

- Direct REST write paths already apply catalogue policy; queued CSV products and variants revalidate on apply, and now reject stale SKU type, tracking and variant-owner changes. Disappeared categories fail instead of being silently dropped.
- The same policy manifest is generated for the frontend/backend. `python scripts/sync_industry_catalogue.py --check` must pass.
- Run real CSV preview / approved apply tests in a disposable DB with intentional interleavings; the source tests do not substitute for transaction isolation tests.
- External/mobile clients must use the same scoped APIs; any future direct-to-database writer is not a supported client interface.

## Existing-account preservation (non-destructive)

1. Freeze writes to the **staging** tenant, back up all authoritative tables and attachments, then take a read-only history capture:
   `AUDIT_DATABASE_URL='...' AUDIT_TENANT_ID='<uuid>' node backend/scripts/capture-catalog-history.mjs capture before.json`.
2. Rehearse each migration on a database branch containing a production-like tenant. Do not rewrite or delete previously applied migrations.
3. Capture `after.json` with the same command and execute:
   `node backend/scripts/capture-catalog-history.mjs compare before.json after.json`.
4. The checksum gate excludes only the business profile's industry choices and `updated_at`. All catalogue, serial, stock, sale, return and pricing rows must be byte-equivalent after reclassification; changed records fail the gate.
5. Keep `before.json` in a restricted release workspace: it contains deterministic identifiers' hashes and counts, not source business records; still treat as internal metadata.
6. Rollback is restore of the **entire** pre-migration database branch or compatible forward repair, not a blind reverse SQL update. Keep all old profile values in an operator-approved migration report.

## Backup and recovery gates

- Encrypted backup manifests must include all 11 critical tables, including empty ones. A missing chunk is an error.
- Restore continues to require a nonproduction target, distinct approval, checksums, object rescan, and release owner sign-off.
- Before COMMIT, the restore worker now compares recovered record counts and runs ten product/category/variant/lot/serial/stock/reservation/sales, stock-allocation and identifier-uniqueness audits, in addition to financial journal balancing. Any error aborts the transaction.
- Required **live** proof: actual restore on an isolated Neon branch; verify reference audits, cross-branch isolation, direct serial lookup, same product IDs, stock balances, receipts and read-only audit snapshots. Exercise the rollback and revocation process.

## 13 industry acceptance matrix

| Industry | Must complete in live authenticated E2E |
|---|---|
| Retail | Barcode-based product receipt, quantity sale, refund and stock valuation |
| Wholesale | Carton/case to piece conversion, mixed orders, partial receipts and credit terms |
| Electronics | Serial receipt, exact-unit sale and warranty/return |
| Phones | IMEI 1/2 receipt, device lookup, double-sale rejection, receipt and return |
| Fashion | Size/colour variant creation, sale of one SKU, exchange and per-variant balance |
| Perfumes/cosmetics | Shade/size variants, cosmetics batch receipt, expiry/quarantine/return |
| Restaurants | Ingredients, menu item, actual recipe consumption, void, waste and costs |
| Bakeries | Recipe batch, dated loaves, FEFO sale, waste and stock reconciliation |
| Hardware | Measured metres/kg, partial selling unit and remaining stock |
| Household | Furniture colour/size variant, bundle stock, dispatch and warranty |
| Repairs | Customer-owned device, assigned technician, spare part consumption, repair invoice |
| Education | Textbook ISBN/edition, school uniform variant and non-stock service fee |
| Other | Custom category fields, quantity/serial policy, correct sale/return and reports |

**Definition of certified:** These journeys must complete from the browser and REST API against a disposable PostgreSQL/Redis setup with owner, cashier, warehouse and technician permissions. Verify ledger postings, snapshots, audit trails, import, backup/restore and branch isolation. A green source-level test or ZIP import is not a substitute.

## Continuous integration

- Local dependency-free: `cd backend && npm test`, then `npm run contract:check` and `node scripts/check-route-uniqueness.mjs`.
- Full CI: `npm ci`, Prisma generate + validate, Nest build, frontend `npm ci`, Vitest, strict TypeScript + Vite build, migrations on a disposable branch, role/tenant HTTP tests, and acceptance suite.
- Deploy only after migration rehearsal, snapshot comparison, backup/restore rehearsal, all 13 end-to-end scenarios, and no severity-high vulnerabilities.
