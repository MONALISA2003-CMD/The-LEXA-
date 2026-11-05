# Electronics inventory — GitHub Actions compiler and transaction integrity repair

**Release context:** GitHub Actions run [42003127067](https://github.com/MONALISA2003-CMD/The-LEXA-/actions/runs/42003127067/job/127163103850), 5 November 2026.

## Root cause of the failed source import

The import and canonical-layout steps succeeded. All 295 Node backend tests, catalogue contract checks, route uniqueness checks, and backup inventory checks succeeded. `nest build` then stopped with **nine strict TypeScript errors**.

Eight errors were introduced by a mismatch between the compatibility review fields in the additive SQL migration and `AccessoryCompatibility` in `backend/prisma/schema.prisma`. The controller uses `compatibilityKind`, `evidence`, `reviewState`, and `revokedAt` but generated Prisma types lacked them. Those fields were added to Prisma with their SQL column mappings, defaults, and nullable revoked timestamp. A separate `TS2552` used `branchId` as an undefined variable instead of the route parameter `branch` in physical identifier lookup.

## Integration and stock integrity repairs

- **Exact device search:** the inventory view uses normalized IMEI/serial lookup, within the authorized branch.
- **Purchase and legacy receipts:** the audited paths propagate additional actual IMEIs to the unit identifier registry, retaining one physical stock unit per handset. Accepted receipts store warehouse, unit cost, and acceptance event, and prevent duplicate identifier claims across existing stock where detectable.
- **Variant creation:** the backend requires permitted variant dimensions, rejects conflicting product and variant SKU/GTIN/barcode identifiers, and maintains atomic batch writes; frontend matrix supports reviewable SKU, barcode, GTIN, and price overrides.
- **Compatible accessories:** POS reads the *approved, branch-stock-aware* recommendation API rather than a merely verified model list. Electrical approval requires source evidence and voltage, current, connector, and confirmation of safety review. Unreviewed, rejected and revoked links do not qualify.
- **Kit definition and assembly:** quantity-tracked components are variant-scoped, and parent/component nested-kit conflicts are prohibited. The assembly transaction accounts for branch reservations and uses `Serializable` isolation. A kit definition does not create stock.
- **Import audit:** read-only Python CSV checks reject duplicate identifiers, bad GTINs, invalid family values, and stock quantities mixed into product creation. A carton preview computes quantities but never writes stock.
- **Frontend:** professional product, unit and compatibility controls, without user-visible implementation notes or stage labels.

## Verification achieved in the release source

- **301/301** Node backend regression tests passed (including new compilation-shape, compatibility/stock, physical-unit, and SKU tests).
- **9/9** Python CSV audit tests passed.
- `scripts/sync_industry_catalogue.py --check` passed; 13 industries maintained.
- `scripts/sync_electronics_catalogue_v2.py --check` passed; 282 nodes, 221 selectable leaves, 52 policies.
- API contract: **442** operations, no missing/orphaned routes.
- Route uniqueness: **465** registrations across **29** controllers.
- Backup and ledger coverage passed.
- **285** TypeScript/TSX sources parsed with zero syntax diagnostics.
- ZIP layout and per-entry CRC checks are run before publishing the source package.

## Important release gates that require CI and a staging PostgreSQL clone

Local parser checks and Node tests do not substitute for `npx prisma generate && npx prisma validate && nest build` or `tsc -b && vite build` with installed dependencies. The importer, backend build, frontend tests/build, and source commit must all succeed in a **new** GitHub Actions run before promotion. The additive migration must be tested on a staging clone, with a verified backup, including row-level security and serial/IMEI collision reports. Do not manually run additive migration against production without staging validation.

### End-to-end acceptance matrix

1. Feature phone: ten genuine single-IMEI dual-SIM phones -> ten physical units; one dual-IMEI phone -> one physical unit; exact unit, branch, SKU, cost and ledger agree.
2. Identifiers: duplicate IMEIs (including historical assignments), wrong-branch or wrong-variant receipts, retries, missing data and quarantined stock must not produce a second available unit.
3. Product wizard: feature phone, smartphone, laptop, charger, fridge, printer and inverter use minimal family fields, valid variant dimensions, and zero stock until an approved receipt.
4. Packaging: 20 cartons x 10 cables = 200 base units; sell 35 -> 165 remains. Check historical effective-dated conversion values.
5. Fitment: a model-specific case is recommended only with verified evidence and available branch stock; an unsafe charger is never recommended.
6. Kits: all component deductions and output movement commit or roll back together. Replays must not double-consume stock.
7. Accounting: purchases, sales, returns, per-unit cost, stock movements, and posted ledger remain reconciled.
8. Multi-tenancy: tenant, branch and role boundaries fail closed at API and database layers, including private identifier search.

**Deployment status at packaging:** source corrections are local; production is not asserted updated. The GitHub connector previously denied direct writes (403), so the validated single root ZIP remains the supported release path.
