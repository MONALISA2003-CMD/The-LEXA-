-- Additive four-division retail specialization. No historical product, SKU, IMEI,
-- sales, or inventory movement rows are modified or removed.
CREATE TABLE public.catalog_brands (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL,
 name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 100),
 normalized_name text NOT NULL CHECK (normalized_name=lower(btrim(name)) AND length(normalized_name)>0),
 created_at timestamptz(3) NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,normalized_name),
 FOREIGN KEY(tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT
);
CREATE TABLE public.catalog_device_models (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL,
 brand_id uuid NOT NULL, name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
 normalized_name text NOT NULL CHECK (normalized_name=lower(btrim(name)) AND length(normalized_name)>0),
 product_type text NOT NULL CHECK (length(product_type) BETWEEN 1 AND 80),
 manufacturer_code text, created_at timestamptz(3) NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,brand_id,product_type,normalized_name),
 FOREIGN KEY(tenant_id,brand_id) REFERENCES public.catalog_brands(tenant_id,id) ON DELETE RESTRICT
);
CREATE INDEX catalog_device_models_by_brand ON public.catalog_device_models(tenant_id,brand_id);
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS catalog_brand_id uuid;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS catalog_model_id uuid;
ALTER TABLE public.products ADD CONSTRAINT products_catalog_brand_tenant_fkey
 FOREIGN KEY(tenant_id,catalog_brand_id) REFERENCES public.catalog_brands(tenant_id,id) ON DELETE RESTRICT;
ALTER TABLE public.products ADD CONSTRAINT products_catalog_model_tenant_fkey
 FOREIGN KEY(tenant_id,catalog_model_id) REFERENCES public.catalog_device_models(tenant_id,id) ON DELETE RESTRICT;
CREATE INDEX products_catalog_brand_idx ON public.products(tenant_id,catalog_brand_id);
CREATE INDEX products_catalog_model_idx ON public.products(tenant_id,catalog_model_id);
CREATE TABLE public.accessory_compatibilities (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,
 accessory_product_id uuid NOT NULL,device_model_id uuid NOT NULL,
 fitment_notes text CHECK(fitment_notes IS NULL OR length(fitment_notes)<=500),
 verified_by_user_id uuid,verified_at timestamptz(3),
 created_at timestamptz(3) NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,accessory_product_id,device_model_id),
 CHECK ((verified_at IS NULL) = (verified_by_user_id IS NULL)),
 FOREIGN KEY(tenant_id,accessory_product_id) REFERENCES public.products(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,device_model_id) REFERENCES public.catalog_device_models(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(verified_by_user_id) REFERENCES public.users(id) ON DELETE RESTRICT
);
CREATE INDEX accessory_compatibilities_search_idx ON public.accessory_compatibilities(tenant_id,device_model_id,verified_at);
CREATE UNIQUE INDEX inventory_serial_inspections_owner_idx ON public.inventory_serials(tenant_id,id);
CREATE TABLE public.inventory_unit_inspections (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,
 branch_id uuid NOT NULL,serial_id uuid NOT NULL,
 condition text NOT NULL CHECK (condition IN ('new','open_box','used_good','used_fair','refurbished','damaged')),
 battery_health_percent integer CHECK (battery_health_percent IS NULL OR battery_health_percent BETWEEN 0 AND 100),
 notes text CHECK(notes IS NULL OR length(notes)<=1000),
 inspected_by_user_id uuid NOT NULL,
 created_at timestamptz(3) NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,serial_id) REFERENCES public.inventory_serials(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,branch_id) REFERENCES public.branches(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(inspected_by_user_id) REFERENCES public.users(id) ON DELETE RESTRICT
);
CREATE INDEX inventory_unit_inspections_timeline ON public.inventory_unit_inspections(tenant_id,serial_id,created_at);
-- Keep application role tenant isolation on every new authoritative table.
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['catalog_brands','catalog_device_models','accessory_compatibilities','inventory_unit_inspections'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',t);
  -- Quotes inside dynamic SQL must be escaped twice: the generated policy
  -- must evaluate current_setting('app.tenant_id', true) and NULLIF(..., '').
  EXECUTE format(
    'CREATE POLICY tenant_scope ON public.%I FOR ALL USING (tenant_id::text = NULLIF(current_setting(''app.tenant_id'', true), '''')) WITH CHECK (tenant_id::text = NULLIF(current_setting(''app.tenant_id'', true), ''''))',
    t
  );
  IF t='inventory_unit_inspections' THEN
   EXECUTE format('GRANT SELECT, INSERT ON TABLE public.%I TO lexa_app_runtime',t);
  ELSE
   EXECUTE format('GRANT SELECT, INSERT, UPDATE ON TABLE public.%I TO lexa_app_runtime',t);
  END IF;
 END LOOP;
END $$;

-- Never rewrite historical inspection evidence; this is an append-only trail.
CREATE OR REPLACE FUNCTION lexa_reject_unit_inspection_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN
 RAISE EXCEPTION 'Physical-unit inspection history is append-only' USING ERRCODE='23514';
END $$;
CREATE TRIGGER lexa_unit_inspection_immutable BEFORE UPDATE OR DELETE
 ON public.inventory_unit_inspections FOR EACH ROW EXECUTE FUNCTION lexa_reject_unit_inspection_mutation();
-- Database-level sale/reservation protection is shared by every API and worker.
-- Does not change stock quantities or historical rows; only guards future status transitions.
CREATE OR REPLACE FUNCTION lexa_guard_damaged_unit_allocation() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE latest_condition text;
BEGIN
 IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('sold','reserved','in_transit') THEN
  SELECT condition INTO latest_condition
    FROM public.inventory_unit_inspections
   WHERE tenant_id=NEW.tenant_id AND serial_id=NEW.id
   ORDER BY created_at DESC,id DESC LIMIT 1;
  IF latest_condition='damaged' THEN
   RAISE EXCEPTION 'LEXA_DAMAGED_UNIT_ALLOCATION_BLOCKED: damaged device requires approved inspection' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER lexa_damaged_unit_allocation BEFORE UPDATE OF status
 ON public.inventory_serials FOR EACH ROW EXECUTE FUNCTION lexa_guard_damaged_unit_allocation();

-- Keep database IMEI validation synchronized with new supported cellular device types.
CREATE OR REPLACE FUNCTION lexa_guard_inventory_serial_identity() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE primary_id text; secondary_id text; product_kind text;
BEGIN
  primary_id := upper(btrim(NEW.serial_number));
  secondary_id := upper(btrim(COALESCE(NEW.identifiers->>'imei2','')));
  IF primary_id = '' OR length(primary_id) > 120 THEN
    RAISE EXCEPTION 'The unit must have an actual serial number or IMEI' USING ERRCODE='23514';
  END IF;
  IF secondary_id <> '' AND secondary_id = primary_id THEN
    RAISE EXCEPTION 'Primary and secondary device identifiers must differ' USING ERRCODE='23514';
  END IF;
  SELECT product_type INTO product_kind FROM products
    WHERE tenant_id = NEW.tenant_id AND id = NEW.product_id;
  IF product_kind IN ('smartphone','feature_phone','cellular_tablet','mifi_router') THEN
    IF NOT lexa_is_valid_imei(primary_id) OR
       (secondary_id <> '' AND NOT lexa_is_valid_imei(secondary_id)) THEN
      RAISE EXCEPTION 'An assigned device IMEI must have 15 digits and a valid check digit' USING ERRCODE='23514';
    END IF;
  ELSIF secondary_id <> '' THEN
    RAISE EXCEPTION 'Second IMEI is only valid for an IMEI-tracked mobile device' USING ERRCODE='23514';
  END IF;

  -- Serialize registrations by business so two writers cannot independently
  -- claim the same identifier in primary or secondary slots at the same time.
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.tenant_id::text, 82713));
  IF EXISTS (
    SELECT 1 FROM inventory_serials existing
    WHERE existing.tenant_id = NEW.tenant_id AND existing.id <> NEW.id
      AND (
        upper(btrim(existing.serial_number)) = primary_id
        OR (secondary_id <> '' AND upper(btrim(existing.serial_number)) = secondary_id)
        OR upper(btrim(COALESCE(existing.identifiers->>'imei2',''))) = primary_id
        OR (secondary_id <> '' AND upper(btrim(COALESCE(existing.identifiers->>'imei2',''))) = secondary_id)
      )
  ) THEN
    RAISE EXCEPTION 'LEXA_SERIAL_IDENTITY_CONFLICT: identifier is already registered for this business' USING ERRCODE='23505';
  END IF;
  RETURN NEW;
END;
$$;


-- Snapshot promised duration at sale time, without rewriting historical receipts.
ALTER TABLE public.sale_lines ADD COLUMN IF NOT EXISTS warranty_months_snapshot integer CHECK (warranty_months_snapshot BETWEEN 0 AND 240);
