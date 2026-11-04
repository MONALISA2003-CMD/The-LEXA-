# LEXA inventory identity: B1 release / production migration

## Scope

- Fix frontend TypeScript `TS2339` by treating category custom fields as optional until a required-field schema is explicitly introduced; do not weaken `exactOptionalPropertyTypes`.
- For stock tracked by individual serial/IMEI, validate manufacturer IMEI check digits in all backend registration routes (lot-bound and standalone); capture both phone IMEIs; show both at checkout.
- Enforce uniqueness at the **database boundary** across normalized primary serial / IMEI and secondary IMEI, across branches and product variants within a business, for every API client, SQL worker, and stock source.
- Restore standalone serialized devices (null lot ID) through an additive correction to the pre-existing capacity trigger. Keep lot quantity locks for lot-bound serials.

This is Phase B1, **not** the complete Phase B inventory identity architecture. Packaging conversions, fully indexed identifier tables, repair/return device histories, bulk barcode/IMEI scanning, and full warehouse E2E must be completed and tested separately.

## Mandatory before deploy

1. Back up the live PostgreSQL database, including serials and their `identifiers` JSON.
2. Rehearse `20261104180000_serial_identity_enforcement` on a Neon staging branch; check SQL and RLS under the same runtime role as production.
3. Audit existing identifiers; the additive trigger does **not** rewrite or delete existing duplicate rows. Run this read-only query and investigate returned duplicates before accepting new serial data:

```sql
WITH ids AS (
  SELECT tenant_id, id AS inventory_serial_id,
         upper(btrim(serial_number)) AS identifier FROM inventory_serials
  UNION ALL
  SELECT tenant_id, id AS inventory_serial_id,
         upper(btrim(identifiers->>'imei2')) AS identifier
  FROM inventory_serials WHERE nullif(btrim(identifiers->>'imei2'),'') IS NOT NULL
)
SELECT tenant_id, identifier, count(DISTINCT inventory_serial_id) AS distinct_units
FROM ids WHERE identifier <> ''
GROUP BY tenant_id, identifier HAVING count(DISTINCT inventory_serial_id) > 1;
```

4. Test creating a serial-tracked phone with `lot_id=NULL` after receiving its opening stock; previously the DB capacity trigger could reject it.
5. Test two branches registering a phone with the same IMEI in primary and secondary positions; expect the second transaction to fail with a conflict. Confirm different tenant IDs may register the same manufacturer serial independently.
6. Validate a real, assigned IMEI with correct check digit; reject 14 digits, 15 digits with bad checksum, repeated primary/secondary values, and `imei2` on non-phone products.
7. Verify a purchased/received lot of a batch-and-serial-tracked product cannot serialize more units than received, including concurrent registration.
8. Run the CI import workflow, backend/Prisma build and tests, frontend `tsc -b && vite build`, migrations, and signed-in API smoke test on Render. Do not call production green before these are complete.

## Cross-module identity contract

Both stock serial registration APIs feed the `inventory_serials` table. The SQL trigger covers any other writer (purchasing, manufacturing legacy workflows, direct service code) without requiring it to know which route inserted the unit. POS uses the same `inventory_serials.id` and displays both actual IMEIs; it still re-verifies availability at sale commit. Existing receipts preserve their historical snapshots, without fabricating secondary IDs.

## Known boundaries

The trigger prevents **new** duplicate identifiers but does not automatically resolve historical collisions; a manual audit and cautious reconciliation is required. The existing JSON `imei2` slot remains in this phase, but is indexed for lookup. A dedicated normalized identifier registry, stronger bidirectional returns/repairs and performance testing under high concurrency belong to Phase B2. All operations are tenant/branch scoped; do not alter past receipt or accounting IDs.
