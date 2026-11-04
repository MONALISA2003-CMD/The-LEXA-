-- Preserve historical products, stock, receipts, sales and identities.
-- Retire five industry selections without deleting business or product data.
WITH normalized AS (
  SELECT tenant_id, ARRAY(
    SELECT DISTINCT selection
      FROM unnest(industries) AS selection
     WHERE selection = ANY(ARRAY['retail_trade','wholesale_distribution','electronics','mobile_phones','fashion_beauty','perfumes_cosmetics','food_hospitality','bakery','construction','household_goods','repair_services','education','other']::TEXT[])
  ) AS active
    FROM business_profiles
)
UPDATE business_profiles AS b
   SET industries = CASE WHEN cardinality(n.active) > 0 THEN n.active ELSE ARRAY['other']::TEXT[] END,
       industry = CASE WHEN b.industry = ANY(ARRAY['agriculture','healthcare','manufacturing','logistics_transport','professional_services','services']::TEXT[])
                       THEN COALESCE(n.active[1],'other') ELSE b.industry END
  FROM normalized n
 WHERE b.tenant_id=n.tenant_id
   AND (b.industries && ARRAY['agriculture','healthcare','manufacturing','logistics_transport','professional_services']::TEXT[]
        OR b.industry = ANY(ARRAY['agriculture','healthcare','manufacturing','logistics_transport','professional_services','services']::TEXT[]));

-- Manufacturing is no longer a selectable business model. Preserve all records.
UPDATE business_profiles
   SET business_models = CASE
       WHEN cardinality(array_remove(business_models,'manufacturing')) > 0
         THEN array_remove(business_models,'manufacturing')
       ELSE ARRAY['other']::TEXT[] END
 WHERE business_models @> ARRAY['manufacturing']::TEXT[];

-- Permit 'Accessories' under two different parents, while preventing siblings from
-- having the same name (including the top-level NULL-parent case).
DROP INDEX IF EXISTS categories_tenant_id_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS categories_tenant_parent_name_unique
  ON categories (tenant_id, (COALESCE(parent_id,'00000000-0000-0000-0000-000000000000'::uuid)), lower(name));
CREATE INDEX IF NOT EXISTS categories_tenant_parent_name_idx
  ON categories (tenant_id, parent_id, name);
