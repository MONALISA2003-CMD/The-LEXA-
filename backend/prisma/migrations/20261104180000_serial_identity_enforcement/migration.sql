-- Phase B1: enforce physical-unit identity for every writer, including direct SQL
-- workers. All existing inventory serial rows and receipts are preserved.
-- Normalize comparison only: the original scanned/manufacturer value is retained.
-- Do not add a new UNIQUE index to existing data until historical duplicates are audited.

CREATE INDEX IF NOT EXISTS inventory_serial_tenant_normalized_primary_idx
  ON inventory_serials(tenant_id, upper(btrim(serial_number)));
CREATE INDEX IF NOT EXISTS inventory_serial_tenant_normalized_second_imei_idx
  ON inventory_serials(tenant_id, upper(btrim(COALESCE(identifiers->>'imei2',''))));

CREATE OR REPLACE FUNCTION lexa_is_valid_imei(candidate text) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE STRICT AS $$
DECLARE sum_digits integer := 0; i integer; digit integer;
BEGIN
  IF candidate !~ '^[0-9]{15}$' THEN RETURN false; END IF;
  FOR i IN 1..15 LOOP
    digit := ascii(substr(candidate,i,1)) - 48;
    IF (i % 2) = 0 THEN
      digit := digit * 2;
      IF digit > 9 THEN digit := digit - 9; END IF;
    END IF;
    sum_digits := sum_digits + digit;
  END LOOP;
  RETURN (sum_digits % 10) = 0;
END;
$$;

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
  IF product_kind IN ('smartphone','feature_phone') THEN
    IF NOT lexa_is_valid_imei(primary_id) OR
       (secondary_id <> '' AND NOT lexa_is_valid_imei(secondary_id)) THEN
      RAISE EXCEPTION 'An assigned device IMEI must have 15 digits and a valid check digit' USING ERRCODE='23514';
    END IF;
  ELSIF secondary_id <> '' THEN
    RAISE EXCEPTION 'Second IMEI is only valid for an IMEI-tracked phone' USING ERRCODE='23514';
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

DROP TRIGGER IF EXISTS inventory_serial_identity_guard ON inventory_serials;
CREATE TRIGGER inventory_serial_identity_guard
  BEFORE INSERT OR UPDATE OF serial_number, identifiers, product_id, tenant_id
  ON inventory_serials FOR EACH ROW
  EXECUTE FUNCTION lexa_guard_inventory_serial_identity();

-- Historic capacity trigger used to reject NEW.lot_id=NULL, which prevented
-- legitimate phones/electronics that track a unit without a batch. Keep the
-- locked capacity check for genuine lot-bound serialized stock.
CREATE OR REPLACE FUNCTION lexa_guard_serial_capacity() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE lot_quantity numeric; serial_count bigint;
BEGIN
  IF NEW.lot_id IS NULL THEN RETURN NEW; END IF;
  SELECT quantity_on_hand INTO lot_quantity FROM inventory_lots
    WHERE tenant_id=NEW.tenant_id AND id=NEW.lot_id FOR UPDATE;
  IF lot_quantity IS NULL THEN RAISE EXCEPTION 'Inventory lot not found'; END IF;
  SELECT count(*) INTO serial_count FROM inventory_serials
    WHERE tenant_id=NEW.tenant_id AND lot_id=NEW.lot_id;
  IF serial_count >= lot_quantity THEN
    RAISE EXCEPTION 'Serial count exceeds lot quantity';
  END IF;
  RETURN NEW;
END;
$$;
