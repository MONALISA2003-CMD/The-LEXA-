-- Safe additive change: existing tenants, products, journal lines and sales are preserved.
ALTER TABLE business_profiles ADD COLUMN IF NOT EXISTS industries TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
-- Existing accounts keep their industry; owners may add more without re-onboarding.
UPDATE business_profiles
   SET industries = ARRAY[CASE lower(trim(industry))
     WHEN 'retail' THEN 'retail_trade'
     WHEN 'wholesale' THEN 'wholesale_distribution'
     WHEN 'restaurant' THEN 'food_hospitality'
     WHEN 'food' THEN 'food_hospitality'
     WHEN 'services' THEN 'professional_services'
     WHEN 'fashion' THEN 'fashion_beauty'
     WHEN 'beauty' THEN 'perfumes_cosmetics'
     WHEN 'phones' THEN 'mobile_phones'
     WHEN 'general' THEN 'other'
     ELSE CASE WHEN lower(trim(industry))=ANY(ARRAY['retail_trade','wholesale_distribution','electronics','mobile_phones','fashion_beauty','perfumes_cosmetics','food_hospitality','bakery','agriculture','construction','household_goods','professional_services','repair_services','healthcare','manufacturing','logistics_transport','education','other']) THEN lower(trim(industry)) ELSE 'other' END
   END]::TEXT[]
 WHERE cardinality(industries)=0 AND industry IS NOT NULL AND length(trim(industry))>0;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS parent_id UUID;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS template_key TEXT;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS attribute_schema JSONB NOT NULL DEFAULT '[]'::jsonb;
CREATE UNIQUE INDEX IF NOT EXISTS categories_tenant_id_id_key ON categories (tenant_id,id);
CREATE INDEX IF NOT EXISTS categories_tenant_parent_idx ON categories(tenant_id,parent_id);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='categories_tenant_parent_fk') THEN
    ALTER TABLE categories ADD CONSTRAINT categories_tenant_parent_fk
      FOREIGN KEY (tenant_id,parent_id) REFERENCES categories(tenant_id,id) ON DELETE RESTRICT;
  END IF;
END $$;
ALTER TABLE products ADD COLUMN IF NOT EXISTS product_type TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS attributes JSONB NOT NULL DEFAULT '{}'::jsonb;
CREATE INDEX IF NOT EXISTS products_tenant_type_idx ON products(tenant_id,product_type);
ALTER TABLE inventory_serials ADD COLUMN IF NOT EXISTS identifiers JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE sale_lines ADD COLUMN IF NOT EXISTS variant_description_snapshot TEXT;
ALTER TABLE sale_lines ADD COLUMN IF NOT EXISTS unit_name_snapshot TEXT;
ALTER TABLE sale_lines ADD COLUMN IF NOT EXISTS serial_numbers_snapshot TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
-- No destructive backfill; original sale snapshots remain immutable.
