-- Electronics stock integrity: additive schema, no existing product/stock/ledger identity changes.
ALTER TABLE public.products ADD COLUMN gtin text;
ALTER TABLE public.product_variants ADD COLUMN gtin text;
ALTER TABLE public.product_variants ADD COLUMN variant_signature text;
ALTER TABLE public.product_packages ADD COLUMN gtin text;
ALTER TABLE public.inventory_serials ADD COLUMN warehouse_id uuid;
ALTER TABLE public.inventory_serials ADD COLUMN receipt_batch_id uuid;
ALTER TABLE public.inventory_serials ADD COLUMN unit_cost_minor integer CHECK(unit_cost_minor IS NULL OR unit_cost_minor >= 0);
ALTER TABLE public.inventory_serials ADD COLUMN accepted_at timestamptz(3);
ALTER TABLE public.inventory_serials ADD CONSTRAINT inventory_serial_warehouse_fkey
 FOREIGN KEY(tenant_id,warehouse_id) REFERENCES public.warehouses(tenant_id,id) ON DELETE RESTRICT;
ALTER TABLE public.accessory_compatibilities ADD COLUMN compatibility_kind text NOT NULL DEFAULT 'physical'
 CHECK(compatibility_kind IN ('physical','electrical','protocol','consumable'));
ALTER TABLE public.accessory_compatibilities ADD COLUMN evidence jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.accessory_compatibilities ADD COLUMN review_state text NOT NULL DEFAULT 'proposed'
 CHECK(review_state IN ('proposed','verified','rejected','revoked','legacy_review_required'));
ALTER TABLE public.accessory_compatibilities ADD COLUMN revoked_at timestamptz(3);
-- Previously verified records require fresh evidence; never silently approve legacy electrical fitment.
UPDATE public.accessory_compatibilities SET review_state='legacy_review_required' WHERE verified_at IS NOT NULL;
CREATE UNIQUE INDEX product_gtin_tenant_unique ON public.products(tenant_id,gtin) WHERE gtin IS NOT NULL;
CREATE UNIQUE INDEX product_variant_gtin_tenant_unique ON public.product_variants(tenant_id,gtin) WHERE gtin IS NOT NULL;
CREATE UNIQUE INDEX product_package_gtin_tenant_unique ON public.product_packages(tenant_id,gtin) WHERE gtin IS NOT NULL;
CREATE UNIQUE INDEX product_variant_signature_unique ON public.product_variants(tenant_id,product_id,variant_signature)
 WHERE variant_signature IS NOT NULL AND active=true;

CREATE TABLE public.inventory_unit_identifiers(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,serial_id uuid NOT NULL,
 identifier_type text NOT NULL CHECK(identifier_type IN('imei','serial','manufacturer_serial','mac','eid')),
 identifier_value text NOT NULL CHECK(length(btrim(identifier_value)) BETWEEN 1 AND 120),
 normalized_value text NOT NULL CHECK(length(btrim(normalized_value)) BETWEEN 1 AND 120),
 source text NOT NULL DEFAULT 'receipt' CHECK(source IN ('receipt','legacy')),legacy_collision boolean NOT NULL DEFAULT false,
 created_at timestamptz(3) NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,serial_id) REFERENCES public.inventory_serials(tenant_id,id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX unit_identifier_claim_unique ON public.inventory_unit_identifiers(tenant_id,normalized_value) WHERE legacy_collision=false;
CREATE INDEX unit_identifier_owner_idx ON public.inventory_unit_identifiers(tenant_id,serial_id);
CREATE INDEX unit_identifier_search_idx ON public.inventory_unit_identifiers(tenant_id,normalized_value);
-- Historical duplicates are explicitly flagged rather than arbitrarily choosing an owner.
WITH ids AS (
 SELECT s.tenant_id,s.id AS serial_id,
   CASE WHEN p.product_type IN ('smartphone','feature_phone','cellular_tablet','mifi_router') THEN 'imei' ELSE 'serial' END AS identifier_type,
   btrim(serial_number) AS value
 FROM public.inventory_serials s JOIN public.products p ON p.tenant_id=s.tenant_id AND p.id=s.product_id
 UNION ALL
 SELECT s.tenant_id,s.id,'imei',btrim(s.identifiers->>'imei2')
 FROM public.inventory_serials s WHERE jsonb_typeof(s.identifiers->'imei2')='string' AND btrim(s.identifiers->>'imei2')<>''
), cleaned AS (
 SELECT *,upper(value) AS norm,count(*) OVER(PARTITION BY tenant_id,upper(value)) AS copies FROM ids
 WHERE value<>'' AND length(value)<=120
)
INSERT INTO public.inventory_unit_identifiers(tenant_id,serial_id,identifier_type,identifier_value,normalized_value,source,legacy_collision)
SELECT tenant_id,serial_id,identifier_type,value,norm,'legacy',copies>1 FROM cleaned;

-- Normalization applies to all existing purchase-receiving and opening-stock API writers,
-- not only the new scanner endpoint. All inserts occur in their parent transaction.
-- Prevent newly received identifiers from claiming an unresolved historical collision.
-- The partial unique index deliberately retains legacy collisions for audit, so
-- this trigger also checks collision-flagged records before creating new claims.
CREATE FUNCTION public.lexa_claim_unit_identifier(
 claim_tenant uuid, claim_serial uuid, claim_kind text, claim_value text
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE normalized text;
BEGIN
 normalized:=upper(btrim(claim_value));
 IF length(normalized)<1 OR length(normalized)>120 THEN
  RAISE EXCEPTION 'Missing or excessive physical-unit identifier' USING ERRCODE='23514';
 END IF;
 -- Obtain one transaction-scoped lock per normalized identity, including legacy
 -- collision claims that are excluded from the partial unique index.
 PERFORM pg_advisory_xact_lock(hashtextextended(claim_tenant::text || ':' || normalized, 0));
 IF EXISTS(SELECT 1 FROM public.inventory_unit_identifiers
           WHERE tenant_id=claim_tenant AND normalized_value=normalized) THEN
  RAISE EXCEPTION 'Physical-unit identifier already registered or historically ambiguous'
   USING ERRCODE='23505';
 END IF;
 INSERT INTO public.inventory_unit_identifiers(tenant_id,serial_id,identifier_type,identifier_value,normalized_value,source)
 VALUES (claim_tenant,claim_serial,claim_kind,btrim(claim_value),normalized,'receipt');
END $$;
CREATE FUNCTION public.lexa_normalize_new_unit_identifiers() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE kind text; value text; i integer; extra jsonb;
BEGIN
 SELECT product_type INTO kind FROM public.products WHERE tenant_id=NEW.tenant_id AND id=NEW.product_id;
 IF kind IS NULL AND NOT EXISTS(SELECT 1 FROM public.products WHERE tenant_id=NEW.tenant_id AND id=NEW.product_id) THEN
  RAISE EXCEPTION 'Product for inventory unit not found' USING ERRCODE='23503';
 END IF;
 kind := CASE WHEN kind IN ('smartphone','feature_phone','cellular_tablet','mifi_router') THEN 'imei' ELSE 'serial' END;
 IF kind='imei' AND NOT public.lexa_is_valid_imei(btrim(NEW.serial_number)) THEN
  RAISE EXCEPTION 'Invalid primary IMEI' USING ERRCODE='23514';
 END IF;
 PERFORM public.lexa_claim_unit_identifier(NEW.tenant_id,NEW.id,kind,NEW.serial_number);
 value:=COALESCE(NEW.identifiers->>'imei2','');
 IF btrim(value)<>'' THEN
  IF kind<>'imei' OR NOT public.lexa_is_valid_imei(btrim(value)) THEN RAISE EXCEPTION 'Invalid additional IMEI' USING ERRCODE='23514'; END IF;
  PERFORM public.lexa_claim_unit_identifier(NEW.tenant_id,NEW.id,'imei',value);
 END IF;
 extra:=NEW.identifiers->'extraImeis';
 IF extra IS NOT NULL THEN
  IF kind<>'imei' OR jsonb_typeof(extra)<>'array' OR jsonb_array_length(extra)>6 THEN
    RAISE EXCEPTION 'Invalid additional IMEI list' USING ERRCODE='23514';
  END IF;
  FOR i IN 0..jsonb_array_length(extra)-1 LOOP
   value:=extra->>i;
   IF NOT public.lexa_is_valid_imei(value) THEN RAISE EXCEPTION 'Invalid additional IMEI' USING ERRCODE='23514'; END IF;
   PERFORM public.lexa_claim_unit_identifier(NEW.tenant_id,NEW.id,'imei',value);
  END LOOP;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER lexa_new_unit_identifiers AFTER INSERT ON public.inventory_serials
 FOR EACH ROW EXECUTE FUNCTION public.lexa_normalize_new_unit_identifiers();

CREATE TABLE public.inventory_receipt_batches(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,branch_id uuid NOT NULL,
 product_id uuid NOT NULL,variant_id uuid,warehouse_id uuid NOT NULL,
 source_kind text NOT NULL CHECK(source_kind IN ('approved_opening','bundle_assembly')),
 reference text NOT NULL CHECK(length(reference) BETWEEN 1 AND 120),
 idempotency_key text NOT NULL CHECK(length(idempotency_key) BETWEEN 8 AND 160),
 payload_hash text NOT NULL CHECK(length(payload_hash)=64),quantity integer NOT NULL CHECK(quantity BETWEEN 1 AND 100),
 actor_user_id uuid NOT NULL,created_at timestamptz(3) NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,idempotency_key),
 FOREIGN KEY(tenant_id,product_id) REFERENCES public.products(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,product_id,variant_id) REFERENCES public.product_variants(tenant_id,product_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,branch_id) REFERENCES public.branches(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(actor_user_id) REFERENCES public.users(id) ON DELETE RESTRICT
);
CREATE INDEX inventory_receipt_batches_branch_idx ON public.inventory_receipt_batches(tenant_id,branch_id,product_id);
ALTER TABLE public.inventory_serials ADD CONSTRAINT inventory_unit_batch_fkey
 FOREIGN KEY(receipt_batch_id) REFERENCES public.inventory_receipt_batches(id) ON DELETE RESTRICT;

CREATE TABLE public.catalog_product_aliases(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,product_id uuid NOT NULL,
 alias_type text NOT NULL CHECK(alias_type IN ('supplier_sku','manufacturer_code','gtin','barcode','brand_reference','other')),
 alias_value text NOT NULL CHECK(length(btrim(alias_value)) BETWEEN 1 AND 120),
 normalized_value text NOT NULL CHECK(length(btrim(normalized_value)) BETWEEN 1 AND 120),
 created_by_user_id uuid NOT NULL,created_at timestamptz(3) NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,normalized_value),
 FOREIGN KEY(tenant_id,product_id) REFERENCES public.products(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(created_by_user_id) REFERENCES public.users(id) ON DELETE RESTRICT
);
CREATE INDEX catalog_product_alias_product_idx ON public.catalog_product_aliases(tenant_id,product_id);
CREATE TABLE public.package_conversion_revisions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,package_id uuid NOT NULL,
 version integer NOT NULL CHECK(version>0),units_per_package numeric(14,3) NOT NULL CHECK(units_per_package>0),
 effective_at timestamptz(3) NOT NULL,actor_user_id uuid NOT NULL,
 created_at timestamptz(3) NOT NULL DEFAULT now(),UNIQUE(tenant_id,package_id,version),
 FOREIGN KEY(tenant_id,package_id) REFERENCES public.product_packages(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(actor_user_id) REFERENCES public.users(id) ON DELETE RESTRICT
);
CREATE INDEX package_conversion_effective_idx ON public.package_conversion_revisions(tenant_id,package_id,effective_at);
INSERT INTO public.package_conversion_revisions(tenant_id,package_id,version,units_per_package,effective_at,actor_user_id)
SELECT p.tenant_id,p.id,1,p.units_per_package,p.created_at,owner.user_id
FROM public.product_packages p
JOIN LATERAL (SELECT m.user_id FROM public.memberships m WHERE m.tenant_id=p.tenant_id
  AND m.role IN ('owner','owner_administrator') AND m.status='ACTIVE'
  ORDER BY m.created_at LIMIT 1) owner ON true;
-- Existing package definitions remain unchanged; all later conversions are immutable versions.

CREATE TABLE public.product_bundles(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,product_id uuid NOT NULL,variant_id uuid,
 mode text NOT NULL CHECK(mode IN('sealed_kit','assembled_kit')),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','active','archived')),
 created_by_user_id uuid NOT NULL,created_at timestamptz(3) NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,product_id),
 UNIQUE(tenant_id,id),
 FOREIGN KEY(tenant_id,product_id) REFERENCES public.products(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(created_by_user_id) REFERENCES public.users(id) ON DELETE RESTRICT
);
CREATE TABLE public.product_bundle_components(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,bundle_id uuid NOT NULL,
 product_id uuid NOT NULL,variant_id uuid,quantity numeric(14,3) NOT NULL CHECK(quantity>0),
 FOREIGN KEY(tenant_id,bundle_id) REFERENCES public.product_bundles(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,product_id) REFERENCES public.products(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,product_id,variant_id) REFERENCES public.product_variants(tenant_id,product_id,id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX bundle_component_identity_unique ON public.product_bundle_components(tenant_id,bundle_id,product_id,variant_id) NULLS NOT DISTINCT;
CREATE INDEX product_bundle_components_idx ON public.product_bundle_components(tenant_id,bundle_id);

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY[
 'inventory_unit_identifiers','inventory_receipt_batches','catalog_product_aliases',
 'package_conversion_revisions','product_bundles','product_bundle_components'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY tenant_scope ON public.%I FOR ALL USING (tenant_id::text = NULLIF(current_setting(''app.tenant_id'',true),'''')) WITH CHECK (tenant_id::text = NULLIF(current_setting(''app.tenant_id'',true),''''))',t);
  EXECUTE format('GRANT SELECT,INSERT ON public.%I TO lexa_app_runtime',t);
 END LOOP;
END $$;
GRANT UPDATE ON public.product_bundles, public.accessory_compatibilities TO lexa_app_runtime;
GRANT UPDATE ON public.inventory_receipt_batches TO lexa_app_runtime;
-- Index/trigger protections hold even when an API client does not use the documented routes.
INSERT INTO public.platform_backup_inventory(table_name,disposition,domain,rationale,dependency_order) VALUES
('inventory_unit_identifiers','authoritative','inventory','One or more actual physical unit identities and historical collision audit',68),
('inventory_receipt_batches','authoritative','inventory','Idempotent exact-unit accepted stock receipt',67),
('catalog_product_aliases','authoritative','catalog','Tenant-owned product and supplier search aliases',57),
('package_conversion_revisions','authoritative','catalog','Effective-dated immutable pack sizes',59),
('product_bundles','authoritative','catalog','Sealed versus assembled kits',61),
('product_bundle_components','authoritative','catalog','Approved component quantities',62)
ON CONFLICT(table_name) DO UPDATE SET disposition=EXCLUDED.disposition,domain=EXCLUDED.domain,rationale=EXCLUDED.rationale,dependency_order=EXCLUDED.dependency_order;
