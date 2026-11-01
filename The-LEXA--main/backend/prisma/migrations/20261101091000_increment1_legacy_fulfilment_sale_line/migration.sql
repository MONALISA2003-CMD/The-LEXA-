-- Record the exact POS sale line represented by a sales-order fulfilment line.
-- Historical rows are backfilled only where there is exactly one safe match.
ALTER TABLE commerce_fulfilment_lines
  ADD COLUMN sale_line_id uuid;

ALTER TABLE commerce_fulfilment_lines
  ADD CONSTRAINT commerce_fulfilment_lines_tenant_sale_line_fkey
    FOREIGN KEY (tenant_id, sale_line_id)
    REFERENCES sale_lines(tenant_id, id) ON DELETE RESTRICT;

CREATE INDEX commerce_fulfilment_lines_sale_line_idx
  ON commerce_fulfilment_lines(tenant_id, sale_line_id)
  WHERE sale_line_id IS NOT NULL;

WITH safe_matches AS (
  SELECT cfl.id AS fulfilment_line_id, MIN(sl.id) AS sale_line_id
  FROM commerce_fulfilment_lines cfl
  JOIN commerce_fulfilments cf
    ON cf.tenant_id = cfl.tenant_id AND cf.id = cfl.fulfilment_id
  JOIN sale_lines sl
    ON sl.tenant_id = cf.tenant_id
   AND sl.sale_id = cf.sale_id
   AND sl.product_id = cfl.product_id
  WHERE cfl.sale_line_id IS NULL
  GROUP BY cfl.id
  HAVING COUNT(sl.id) = 1
)
UPDATE commerce_fulfilment_lines cfl
SET sale_line_id = safe_matches.sale_line_id
FROM safe_matches
WHERE cfl.id = safe_matches.fulfilment_line_id;

-- Rebuild historic item snapshots only for unambiguous sale-line matches.
-- Ambiguous historical lines are intentionally left unmapped; Increment 1's
-- dispatch API blocks additional dispatch for that product until reconciled.
INSERT INTO commerce_delivery_items (
  tenant_id, delivery_id, sale_line_id, product_id,
  product_name_snapshot, sku_snapshot, variant_id, lot_id, serial_ids,
  quantity, unit_selling_minor, total_selling_minor, unit_cost_minor, total_cost_minor
)
SELECT cfl.tenant_id, d.id, sl.id, sl.product_id,
       sl.product_name_snapshot, p.sku, sl.variant_id, sl.lot_id, sl.serial_ids,
       cfl.quantity,
       sl.unit_price_minor,
       ROUND(sl.line_total_minor::numeric * cfl.quantity / NULLIF(sl.quantity, 0))::bigint,
       sl.unit_cost_minor,
       ROUND(sl.unit_cost_minor::numeric * cfl.quantity)::bigint
FROM commerce_fulfilment_lines cfl
JOIN commerce_fulfilments cf
  ON cf.tenant_id = cfl.tenant_id AND cf.id = cfl.fulfilment_id
JOIN commerce_deliveries d
  ON d.tenant_id = cf.tenant_id AND d.fulfilment_id = cf.id
JOIN sale_lines sl
  ON sl.tenant_id = cfl.tenant_id AND sl.id = cfl.sale_line_id
JOIN products p
  ON p.tenant_id = sl.tenant_id AND p.id = sl.product_id
WHERE cfl.sale_line_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM commerce_delivery_items di
    WHERE di.tenant_id = cfl.tenant_id
      AND di.delivery_id = d.id
      AND di.sale_line_id = sl.id
  );
