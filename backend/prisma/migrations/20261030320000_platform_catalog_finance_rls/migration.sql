-- Workstreams 0-3 completion: tenant-scoped platform invitations, catalogue,
-- inventory control, credit notes and typed finance subledgers.

CREATE TABLE IF NOT EXISTS workspace_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email text NOT NULL, role text NOT NULL, branch_scope_mode text NOT NULL DEFAULT 'all' CHECK (branch_scope_mode IN ('all','restricted')),
  branch_ids text[] NOT NULL DEFAULT '{}', token_hash text NOT NULL UNIQUE, idempotency_key text NOT NULL, request_hash text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','ACCEPTED','EXPIRED','REVOKED','DELIVERY_FAILED')),
  expires_at timestamptz NOT NULL, invited_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  accepted_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL, accepted_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,idempotency_key), UNIQUE (tenant_id,id)
);
CREATE INDEX IF NOT EXISTS workspace_invitations_tenant_email_status_idx ON workspace_invitations(tenant_id,email,status);
CREATE INDEX IF NOT EXISTS workspace_invitations_tenant_expires_idx ON workspace_invitations(tenant_id,expires_at);

CREATE TABLE IF NOT EXISTS unit_of_measures (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 code text NOT NULL, name text NOT NULL, dimension text NOT NULL DEFAULT 'quantity', precision smallint NOT NULL DEFAULT 3 CHECK (precision BETWEEN 0 AND 6), active boolean NOT NULL DEFAULT true,
 UNIQUE (tenant_id,code), UNIQUE (tenant_id,id)
);
CREATE TABLE IF NOT EXISTS product_variants (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT, sku text NOT NULL, barcode text, attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
 cost_price_minor integer NOT NULL DEFAULT 0 CHECK(cost_price_minor>=0), selling_price_minor integer NOT NULL DEFAULT 0 CHECK(selling_price_minor>=0), active boolean NOT NULL DEFAULT true,
 UNIQUE (tenant_id,sku), UNIQUE (tenant_id,id)
);
CREATE INDEX IF NOT EXISTS product_variants_tenant_product_idx ON product_variants(tenant_id,product_id);
CREATE TABLE IF NOT EXISTS tax_codes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 code text NOT NULL, name text NOT NULL, rate_basis_points integer NOT NULL CHECK(rate_basis_points BETWEEN 0 AND 100000),
 calculation text NOT NULL DEFAULT 'exclusive' CHECK(calculation IN ('exclusive','inclusive','exempt')), effective_from date NOT NULL DEFAULT CURRENT_DATE,
 effective_to date, active boolean NOT NULL DEFAULT true, UNIQUE(tenant_id,code), UNIQUE(tenant_id,id), CHECK(effective_to IS NULL OR effective_to>=effective_from)
);
CREATE TABLE IF NOT EXISTS price_lists (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 code text NOT NULL, name text NOT NULL, currency char(3) NOT NULL DEFAULT 'UGX', starts_at timestamptz, ends_at timestamptz, active boolean NOT NULL DEFAULT true,
 UNIQUE(tenant_id,code), UNIQUE(tenant_id,id), CHECK(ends_at IS NULL OR starts_at IS NULL OR ends_at>starts_at)
);
CREATE TABLE IF NOT EXISTS price_list_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 price_list_id uuid NOT NULL, product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT, variant_id uuid REFERENCES product_variants(id) ON DELETE RESTRICT,
 unit_price_minor integer NOT NULL CHECK(unit_price_minor>=0), tax_code_id uuid REFERENCES tax_codes(id) ON DELETE RESTRICT,
 UNIQUE(tenant_id,price_list_id,product_id,variant_id), FOREIGN KEY(tenant_id,price_list_id) REFERENCES price_lists(tenant_id,id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS warehouses (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT, code text NOT NULL, name text NOT NULL, active boolean NOT NULL DEFAULT true,
 UNIQUE(tenant_id,branch_id,code), UNIQUE(tenant_id,id)
);
CREATE TABLE IF NOT EXISTS storage_bins (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 warehouse_id uuid NOT NULL, code text NOT NULL, name text NOT NULL, bin_type text NOT NULL DEFAULT 'storage' CHECK(bin_type IN ('storage','receiving','quarantine','scrap','dispatch')),
 active boolean NOT NULL DEFAULT true, UNIQUE(tenant_id,warehouse_id,code), UNIQUE(tenant_id,id),
 FOREIGN KEY(tenant_id,warehouse_id) REFERENCES warehouses(tenant_id,id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS inventory_lots (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT, warehouse_id uuid NOT NULL, bin_id uuid,
 product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT, variant_id uuid REFERENCES product_variants(id) ON DELETE RESTRICT,
 lot_number text NOT NULL, expiry_date date, quantity_on_hand numeric(14,3) NOT NULL DEFAULT 0 CHECK(quantity_on_hand>=0),
 quantity_reserved numeric(14,3) NOT NULL DEFAULT 0 CHECK(quantity_reserved>=0 AND quantity_reserved<=quantity_on_hand), quantity_quarantined numeric(14,3) NOT NULL DEFAULT 0 CHECK(quantity_quarantined>=0),
 unit_cost_minor integer NOT NULL DEFAULT 0 CHECK(unit_cost_minor>=0), status text NOT NULL DEFAULT 'available' CHECK(status IN ('available','quarantine','scrap','expired','depleted')),
 UNIQUE(tenant_id,product_id,warehouse_id,lot_number), UNIQUE(tenant_id,id),
 FOREIGN KEY(tenant_id,warehouse_id) REFERENCES warehouses(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,bin_id) REFERENCES storage_bins(tenant_id,id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS inventory_lots_tenant_branch_product_expiry_idx ON inventory_lots(tenant_id,branch_id,product_id,expiry_date);
CREATE TABLE IF NOT EXISTS inventory_serials (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT, product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
 variant_id uuid REFERENCES product_variants(id) ON DELETE RESTRICT, lot_id uuid, serial_number text NOT NULL,
 status text NOT NULL DEFAULT 'available' CHECK(status IN ('available','reserved','sold','returned','quarantine','scrap','in_transit')),
 UNIQUE(tenant_id,serial_number), UNIQUE(tenant_id,id), FOREIGN KEY(tenant_id,lot_id) REFERENCES inventory_lots(tenant_id,id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS stock_reservations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT, product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
 variant_id uuid REFERENCES product_variants(id) ON DELETE RESTRICT, warehouse_id uuid REFERENCES warehouses(id) ON DELETE RESTRICT,
 lot_id uuid, order_module text NOT NULL, order_id text NOT NULL, quantity numeric(14,3) NOT NULL CHECK(quantity>0),
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','consumed','released','expired')),
 expires_at timestamptz, idempotency_key text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,idempotency_key),
 FOREIGN KEY(tenant_id,lot_id) REFERENCES inventory_lots(tenant_id,id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS stock_reservations_tenant_branch_product_status_idx ON stock_reservations(tenant_id,branch_id,product_id,status);

CREATE OR REPLACE FUNCTION lexa_reservation_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE reserve_delta numeric(14,3); updated integer;
BEGIN
 IF TG_OP='UPDATE' AND OLD.status='active' AND OLD.lot_id IS NOT NULL
   AND (NEW.status<>'active' OR NEW.lot_id IS DISTINCT FROM OLD.lot_id) THEN
   UPDATE inventory_lots SET quantity_reserved=GREATEST(0,quantity_reserved-OLD.quantity)
     WHERE tenant_id=OLD.tenant_id AND id=OLD.lot_id;
 END IF;
 IF NEW.status='active' AND NEW.lot_id IS NOT NULL THEN
   reserve_delta := NEW.quantity;
   IF TG_OP='UPDATE' AND OLD.status='active' AND NEW.lot_id=OLD.lot_id THEN
     reserve_delta := NEW.quantity-OLD.quantity;
   END IF;
   IF reserve_delta>0 THEN
     UPDATE inventory_lots SET quantity_reserved=quantity_reserved+reserve_delta
       WHERE tenant_id=NEW.tenant_id AND id=NEW.lot_id AND status='available'
         AND (expiry_date IS NULL OR expiry_date>=CURRENT_DATE)
         AND quantity_on_hand-quantity_reserved>=reserve_delta;
     GET DIAGNOSTICS updated = ROW_COUNT;
     IF updated<>1 THEN RAISE EXCEPTION 'Insufficient unreserved lot quantity'; END IF;
   ELSIF reserve_delta<0 THEN
     UPDATE inventory_lots SET quantity_reserved=GREATEST(0,quantity_reserved+reserve_delta)
       WHERE tenant_id=NEW.tenant_id AND id=NEW.lot_id;
   END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS stock_reservations_capacity_guard ON stock_reservations;
CREATE TRIGGER stock_reservations_capacity_guard BEFORE INSERT OR UPDATE OF quantity,status,lot_id ON stock_reservations FOR EACH ROW EXECUTE FUNCTION lexa_reservation_guard();

CREATE TABLE IF NOT EXISTS credit_notes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT, sale_id uuid NOT NULL REFERENCES sales(id) ON DELETE RESTRICT,
 return_id uuid REFERENCES sale_returns(id) ON DELETE RESTRICT, credit_note_number text NOT NULL, customer_id uuid,
 subtotal_minor integer NOT NULL CHECK(subtotal_minor>=0), tax_minor integer NOT NULL DEFAULT 0 CHECK(tax_minor>=0), total_minor integer NOT NULL CHECK(total_minor=subtotal_minor+tax_minor),
 reason text NOT NULL, status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','issued','applied','voided')),
 ledger_journal_id uuid REFERENCES ledger_journals(id) ON DELETE RESTRICT, idempotency_key text NOT NULL,
 issued_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,credit_note_number), UNIQUE(tenant_id,idempotency_key), UNIQUE(tenant_id,id)
);
CREATE TABLE IF NOT EXISTS credit_note_lines (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 credit_note_id uuid NOT NULL, product_id uuid REFERENCES products(id) ON DELETE RESTRICT, description text NOT NULL,
 quantity numeric(14,3) NOT NULL DEFAULT 1 CHECK(quantity>0), unit_price_minor integer NOT NULL CHECK(unit_price_minor>=0),
 tax_code_id uuid REFERENCES tax_codes(id) ON DELETE RESTRICT, tax_minor integer NOT NULL DEFAULT 0 CHECK(tax_minor>=0), total_minor integer NOT NULL CHECK(total_minor>=0),
 FOREIGN KEY(tenant_id,credit_note_id) REFERENCES credit_notes(tenant_id,id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS cash_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
 session_number text NOT NULL, opened_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT, closed_by_user_id uuid REFERENCES users(id) ON DELETE RESTRICT,
 opening_float_minor bigint NOT NULL DEFAULT 0 CHECK(opening_float_minor>=0), expected_closing_minor bigint, counted_closing_minor bigint, variance_minor bigint,
 status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed','reconciled','voided')), opened_at timestamptz NOT NULL DEFAULT now(), closed_at timestamptz,
 UNIQUE(tenant_id,branch_id,session_number), UNIQUE(tenant_id,id), CHECK((status='open' AND closed_at IS NULL) OR status<>'open')
);
CREATE UNIQUE INDEX IF NOT EXISTS cash_sessions_one_open_per_user_branch_idx ON cash_sessions(tenant_id,branch_id,opened_by_user_id) WHERE status='open';
CREATE TABLE IF NOT EXISTS cash_movements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
 cash_session_id uuid NOT NULL, direction text NOT NULL CHECK(direction IN ('in','out')), category text NOT NULL,
 amount_minor bigint NOT NULL CHECK(amount_minor>0), reference_type text, reference_id text, idempotency_key text NOT NULL, request_hash text,
 created_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,idempotency_key),
 FOREIGN KEY(tenant_id,cash_session_id) REFERENCES cash_sessions(tenant_id,id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS cash_ups (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
 cash_session_id uuid NOT NULL UNIQUE, counted_minor bigint NOT NULL CHECK(counted_minor>=0), expected_minor bigint NOT NULL CHECK(expected_minor>=0), variance_minor bigint NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','posted','rejected')), posted_journal_id uuid REFERENCES ledger_journals(id) ON DELETE RESTRICT,
 approved_by_user_id uuid REFERENCES users(id) ON DELETE RESTRICT, approved_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,cash_session_id) REFERENCES cash_sessions(tenant_id,id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS bank_accounts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, branch_id uuid REFERENCES branches(id) ON DELETE RESTRICT,
 account_name text NOT NULL, bank_name text NOT NULL, account_number_masked text NOT NULL, currency char(3) NOT NULL DEFAULT 'UGX', ledger_account_id uuid REFERENCES ledger_accounts(id) ON DELETE RESTRICT, active boolean NOT NULL DEFAULT true,
 UNIQUE(tenant_id,bank_name,account_number_masked), UNIQUE(tenant_id,id)
);
CREATE TABLE IF NOT EXISTS bank_statement_lines (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, bank_account_id uuid NOT NULL,
 transaction_date date NOT NULL, description text NOT NULL, reference text, amount_minor bigint NOT NULL CHECK(amount_minor<>0), direction text NOT NULL CHECK(direction IN ('credit','debit')),
 external_id text, reconciliation_status text NOT NULL DEFAULT 'unmatched' CHECK(reconciliation_status IN ('unmatched','matched','ignored')),
 UNIQUE(tenant_id,id),
 FOREIGN KEY(tenant_id,bank_account_id) REFERENCES bank_accounts(tenant_id,id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS bank_statement_lines_external_idx ON bank_statement_lines(tenant_id,bank_account_id,external_id) WHERE external_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS bank_reconciliations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, bank_account_id uuid NOT NULL,
 statement_date date NOT NULL, opening_balance_minor bigint NOT NULL, closing_balance_minor bigint NOT NULL, reconciled_balance_minor bigint NOT NULL DEFAULT 0,
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','in_progress','completed','voided')), completed_by_user_id uuid REFERENCES users(id) ON DELETE RESTRICT, completed_at timestamptz,
 UNIQUE(tenant_id,id),
 FOREIGN KEY(tenant_id,bank_account_id) REFERENCES bank_accounts(tenant_id,id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS bank_reconciliation_matches (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 reconciliation_id uuid NOT NULL, statement_line_id uuid NOT NULL, journal_line_id uuid REFERENCES ledger_journal_lines(id) ON DELETE RESTRICT,
 matched_amount_minor bigint NOT NULL CHECK(matched_amount_minor<>0), UNIQUE(tenant_id,reconciliation_id,statement_line_id),
 FOREIGN KEY(tenant_id,reconciliation_id) REFERENCES bank_reconciliations(tenant_id,id) ON DELETE CASCADE,
 FOREIGN KEY(tenant_id,statement_line_id) REFERENCES bank_statement_lines(tenant_id,id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS cost_centres (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, code text NOT NULL, name text NOT NULL,
 parent_id uuid, active boolean NOT NULL DEFAULT true, UNIQUE(tenant_id,code), UNIQUE(tenant_id,id),
 FOREIGN KEY(tenant_id,parent_id) REFERENCES cost_centres(tenant_id,id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS expense_categories (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, code text NOT NULL, name text NOT NULL,
 ledger_account_id uuid NOT NULL REFERENCES ledger_accounts(id) ON DELETE RESTRICT, active boolean NOT NULL DEFAULT true, UNIQUE(tenant_id,code), UNIQUE(tenant_id,id)
);
CREATE TABLE IF NOT EXISTS expenses (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
 expense_number text NOT NULL, category_id uuid NOT NULL, supplier_id uuid, cost_centre_id uuid, description text NOT NULL,
 subtotal_minor integer NOT NULL CHECK(subtotal_minor>=0), tax_minor integer NOT NULL DEFAULT 0 CHECK(tax_minor>=0), total_minor integer NOT NULL CHECK(total_minor=subtotal_minor+tax_minor),
 expense_date date NOT NULL, status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','submitted','approved','paid','voided')),
 ledger_journal_id uuid REFERENCES ledger_journals(id) ON DELETE RESTRICT, idempotency_key text NOT NULL, request_hash text NOT NULL, created_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 approved_by_user_id uuid REFERENCES users(id) ON DELETE RESTRICT, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,expense_number), UNIQUE(tenant_id,idempotency_key),
 FOREIGN KEY(tenant_id,category_id) REFERENCES expense_categories(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,cost_centre_id) REFERENCES cost_centres(tenant_id,id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS fixed_assets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
 asset_number text NOT NULL, name text NOT NULL, description text, acquisition_date date NOT NULL, acquisition_cost_minor bigint NOT NULL CHECK(acquisition_cost_minor>0),
 residual_value_minor bigint NOT NULL DEFAULT 0 CHECK(residual_value_minor>=0 AND residual_value_minor<=acquisition_cost_minor), useful_life_months integer NOT NULL CHECK(useful_life_months>0),
 depreciation_method text NOT NULL DEFAULT 'straight_line' CHECK(depreciation_method IN ('straight_line','declining_balance','none')),
 accumulated_depreciation_minor bigint NOT NULL DEFAULT 0 CHECK(accumulated_depreciation_minor>=0), status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','disposed','impaired')),
 asset_account_id uuid NOT NULL REFERENCES ledger_accounts(id) ON DELETE RESTRICT, depreciation_account_id uuid NOT NULL REFERENCES ledger_accounts(id) ON DELETE RESTRICT,
 accumulated_account_id uuid NOT NULL REFERENCES ledger_accounts(id) ON DELETE RESTRICT, UNIQUE(tenant_id,asset_number), UNIQUE(tenant_id,id)
);
CREATE TABLE IF NOT EXISTS fixed_asset_depreciations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, asset_id uuid NOT NULL,
 accounting_period_id uuid NOT NULL REFERENCES accounting_periods(id) ON DELETE RESTRICT, amount_minor bigint NOT NULL CHECK(amount_minor>=0),
 ledger_journal_id uuid REFERENCES ledger_journals(id) ON DELETE RESTRICT, status text NOT NULL DEFAULT 'posted' CHECK(status IN ('draft','posted','reversed')),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,asset_id,accounting_period_id),
 FOREIGN KEY(tenant_id,asset_id) REFERENCES fixed_assets(tenant_id,id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS cost_centre_allocations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, journal_line_id uuid NOT NULL REFERENCES ledger_journal_lines(id) ON DELETE RESTRICT,
 cost_centre_id uuid NOT NULL, amount_minor bigint NOT NULL CHECK(amount_minor>=0), percentage_basis_points integer NOT NULL CHECK(percentage_basis_points BETWEEN 0 AND 10000),
 UNIQUE(tenant_id,journal_line_id,cost_centre_id), FOREIGN KEY(tenant_id,cost_centre_id) REFERENCES cost_centres(tenant_id,id) ON DELETE RESTRICT
);


-- Master-data links and immutable transaction snapshots.
ALTER TABLE products ADD COLUMN IF NOT EXISTS unit_of_measure_id uuid REFERENCES unit_of_measures(id) ON DELETE RESTRICT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS default_tax_code_id uuid REFERENCES tax_codes(id) ON DELETE RESTRICT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS track_lot boolean NOT NULL DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS track_serial boolean NOT NULL DEFAULT false;
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_serial_requires_lot_check;
ALTER TABLE products ADD CONSTRAINT products_serial_requires_lot_check CHECK (NOT track_serial OR track_lot);
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_lot_requires_stock_check;
ALTER TABLE products ADD CONSTRAINT products_lot_requires_stock_check CHECK (NOT track_lot OR track_stock);
ALTER TABLE sale_lines ADD COLUMN IF NOT EXISTS variant_id uuid REFERENCES product_variants(id) ON DELETE RESTRICT;
ALTER TABLE sale_lines ADD COLUMN IF NOT EXISTS unit_of_measure_id uuid REFERENCES unit_of_measures(id) ON DELETE RESTRICT;
ALTER TABLE sale_lines ADD COLUMN IF NOT EXISTS tax_code_id uuid REFERENCES tax_codes(id) ON DELETE RESTRICT;
ALTER TABLE sale_lines ADD COLUMN IF NOT EXISTS tax_rate_basis_points integer NOT NULL DEFAULT 0 CHECK(tax_rate_basis_points BETWEEN 0 AND 100000);
ALTER TABLE sale_lines ADD COLUMN IF NOT EXISTS lot_id uuid;
ALTER TABLE sale_lines ADD COLUMN IF NOT EXISTS serial_ids uuid[] NOT NULL DEFAULT '{}';
ALTER TABLE sale_return_lines ADD COLUMN IF NOT EXISTS serial_ids uuid[] NOT NULL DEFAULT '{}';
ALTER TABLE sale_lines ADD COLUMN IF NOT EXISTS tax_minor integer NOT NULL DEFAULT 0 CHECK(tax_minor>=0);
ALTER TABLE sale_lines ADD COLUMN IF NOT EXISTS price_list_id uuid REFERENCES price_lists(id) ON DELETE RESTRICT;
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS variant_id uuid;
CREATE INDEX IF NOT EXISTS stock_movements_tenant_branch_variant_idx ON stock_movements(tenant_id,branch_id,product_id,variant_id,created_at);
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS warehouse_id uuid;
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS bin_id uuid;
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS lot_id uuid;
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS serial_id uuid;
ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_tenant_warehouse_fk FOREIGN KEY(tenant_id,warehouse_id) REFERENCES warehouses(tenant_id,id) ON DELETE RESTRICT;
ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_tenant_bin_fk FOREIGN KEY(tenant_id,bin_id) REFERENCES storage_bins(tenant_id,id) ON DELETE RESTRICT;
ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_tenant_lot_fk FOREIGN KEY(tenant_id,lot_id) REFERENCES inventory_lots(tenant_id,id) ON DELETE RESTRICT;
ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_tenant_serial_fk FOREIGN KEY(tenant_id,serial_id) REFERENCES inventory_serials(tenant_id,id) ON DELETE RESTRICT;
ALTER TABLE sale_payments ADD COLUMN IF NOT EXISTS cash_session_id uuid;
ALTER TABLE sale_payments ADD CONSTRAINT sale_payments_tenant_cash_session_fk FOREIGN KEY(tenant_id,cash_session_id) REFERENCES cash_sessions(tenant_id,id) ON DELETE RESTRICT;
CREATE TABLE IF NOT EXISTS tax_rules (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 code text NOT NULL, tax_code_id uuid NOT NULL, applies_to text NOT NULL DEFAULT 'all' CHECK(applies_to IN ('all','product','category','customer_type')),
 product_id uuid REFERENCES products(id) ON DELETE RESTRICT, category_id uuid REFERENCES categories(id) ON DELETE RESTRICT,
 customer_type text, priority integer NOT NULL DEFAULT 100, effective_from date NOT NULL DEFAULT CURRENT_DATE,
 effective_to date, active boolean NOT NULL DEFAULT true, UNIQUE(tenant_id,code), UNIQUE(tenant_id,id),
 FOREIGN KEY(tenant_id,tax_code_id) REFERENCES tax_codes(tenant_id,id) ON DELETE RESTRICT,
 CHECK(effective_to IS NULL OR effective_to>=effective_from)
);
CREATE INDEX IF NOT EXISTS tax_rules_tenant_effective_idx ON tax_rules(tenant_id,active,priority,effective_from,effective_to);

-- RLS: all tenant-owned tables, including every table introduced above. The
-- app must connect with DATABASE_RUNTIME_ROLE=lexa_app_runtime and set GUCs per request.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='lexa_app_runtime') THEN
    CREATE ROLE lexa_app_runtime NOLOGIN NOBYPASSRLS;
  ELSE
    ALTER ROLE lexa_app_runtime NOLOGIN NOBYPASSRLS;
  END IF;
END $$;
GRANT lexa_app_runtime TO CURRENT_USER;
GRANT USAGE ON SCHEMA public TO lexa_app_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO lexa_app_runtime;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO lexa_app_runtime;
DO $$ BEGIN EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO lexa_app_runtime',current_user); EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT USAGE,SELECT ON SEQUENCES TO lexa_app_runtime',current_user); END $$;
DO $$ DECLARE item record; policy_name text;
BEGIN
 FOR item IN SELECT table_name FROM information_schema.columns WHERE table_schema='public' AND column_name='tenant_id'
   AND table_name NOT IN ('sessions','password_reset_tokens') GROUP BY table_name LOOP
   policy_name := left(item.table_name || '_tenant_scope', 60);
   EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',item.table_name);
   EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',item.table_name);
   EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I',policy_name,item.table_name);
   IF item.table_name='memberships' THEN
     EXECUTE 'DROP POLICY IF EXISTS memberships_user_membership_read ON public.memberships';
     EXECUTE 'DROP POLICY IF EXISTS memberships_tenant_scoped_write ON public.memberships';
     EXECUTE 'DROP POLICY IF EXISTS memberships_tenant_write ON public.memberships';
     EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (tenant_id::text=NULLIF(current_setting(''app.tenant_id'',true),'''') OR user_id::text=NULLIF(current_setting(''app.user_id'',true),''''))',policy_name,item.table_name);
     EXECUTE format('CREATE POLICY memberships_tenant_write ON public.%I FOR ALL USING (tenant_id::text=NULLIF(current_setting(''app.tenant_id'',true),'''')) WITH CHECK (tenant_id::text=NULLIF(current_setting(''app.tenant_id'',true),''''))',item.table_name);
   ELSE
     EXECUTE format('CREATE POLICY %I ON public.%I USING (tenant_id::text=NULLIF(current_setting(''app.tenant_id'',true),'''')) WITH CHECK (tenant_id::text=NULLIF(current_setting(''app.tenant_id'',true),''''))',policy_name,item.table_name);
   END IF;
 END LOOP;
END $$;
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenants_member_read ON tenants;
CREATE POLICY tenants_member_read ON tenants FOR SELECT USING (
 id::text=NULLIF(current_setting('app.tenant_id',true),'') OR EXISTS (
  SELECT 1 FROM memberships m WHERE m.tenant_id=tenants.id AND m.user_id::text=NULLIF(current_setting('app.user_id',true),'') AND m.status='ACTIVE'
 )
);
DROP POLICY IF EXISTS tenants_current_write ON tenants;
CREATE POLICY tenants_current_write ON tenants FOR UPDATE USING (id::text=NULLIF(current_setting('app.tenant_id',true),'')) WITH CHECK (id::text=NULLIF(current_setting('app.tenant_id',true),''));
DROP POLICY IF EXISTS tenants_create_authenticated ON tenants;
CREATE POLICY tenants_create_authenticated ON tenants FOR INSERT WITH CHECK (NULLIF(current_setting('app.user_id',true),'') IS NOT NULL);

-- Session and reset tokens are user-owned rather than tenant-owned. Lookup
-- by the presented one-time hash is allowed; all writes remain user-scoped.
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sessions_user_scope ON sessions;
DROP POLICY IF EXISTS sessions_user_read ON sessions;
DROP POLICY IF EXISTS sessions_user_insert ON sessions;
DROP POLICY IF EXISTS sessions_user_update ON sessions;
DROP POLICY IF EXISTS sessions_user_delete ON sessions;
CREATE POLICY sessions_user_read ON sessions FOR SELECT USING (user_id::text=NULLIF(current_setting('app.user_id',true),'') OR token_hash=NULLIF(current_setting('app.session_token_hash',true),''));
CREATE POLICY sessions_user_insert ON sessions FOR INSERT WITH CHECK (user_id::text=NULLIF(current_setting('app.user_id',true),''));
CREATE POLICY sessions_user_update ON sessions FOR UPDATE USING (user_id::text=NULLIF(current_setting('app.user_id',true),'')) WITH CHECK (user_id::text=NULLIF(current_setting('app.user_id',true),''));
CREATE POLICY sessions_user_delete ON sessions FOR DELETE USING (user_id::text=NULLIF(current_setting('app.user_id',true),'') OR token_hash=NULLIF(current_setting('app.session_token_hash',true),''));

ALTER TABLE password_reset_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE password_reset_tokens FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS password_reset_tokens_user_scope ON password_reset_tokens;
DROP POLICY IF EXISTS password_reset_tokens_user_read ON password_reset_tokens;
DROP POLICY IF EXISTS password_reset_tokens_user_insert ON password_reset_tokens;
DROP POLICY IF EXISTS password_reset_tokens_user_update ON password_reset_tokens;
DROP POLICY IF EXISTS password_reset_tokens_user_delete ON password_reset_tokens;
CREATE POLICY password_reset_tokens_user_read ON password_reset_tokens FOR SELECT USING (user_id::text=NULLIF(current_setting('app.user_id',true),'') OR token_hash=NULLIF(current_setting('app.reset_token_hash',true),''));
CREATE POLICY password_reset_tokens_user_insert ON password_reset_tokens FOR INSERT WITH CHECK (user_id::text=NULLIF(current_setting('app.user_id',true),''));
CREATE POLICY password_reset_tokens_user_update ON password_reset_tokens FOR UPDATE USING (user_id::text=NULLIF(current_setting('app.user_id',true),'') OR token_hash=NULLIF(current_setting('app.reset_token_hash',true),'')) WITH CHECK (user_id::text=NULLIF(current_setting('app.user_id',true),'') OR token_hash=NULLIF(current_setting('app.reset_token_hash',true),''));
CREATE POLICY password_reset_tokens_user_delete ON password_reset_tokens FOR DELETE USING (user_id::text=NULLIF(current_setting('app.user_id',true),'') OR token_hash=NULLIF(current_setting('app.reset_token_hash',true),''));

-- Keep serialised units within lot quantity, including concurrent attempts.
CREATE OR REPLACE FUNCTION lexa_guard_serial_capacity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE lot_quantity numeric; serial_count bigint;
BEGIN
 SELECT quantity_on_hand INTO lot_quantity FROM inventory_lots WHERE tenant_id=NEW.tenant_id AND id=NEW.lot_id FOR UPDATE;
 IF lot_quantity IS NULL THEN RAISE EXCEPTION 'Inventory lot not found'; END IF;
 SELECT count(*) INTO serial_count FROM inventory_serials WHERE tenant_id=NEW.tenant_id AND lot_id=NEW.lot_id;
 IF serial_count >= lot_quantity THEN RAISE EXCEPTION 'Serial count exceeds lot quantity'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS inventory_serial_capacity_guard ON inventory_serials;
CREATE TRIGGER inventory_serial_capacity_guard BEFORE INSERT ON inventory_serials FOR EACH ROW EXECUTE FUNCTION lexa_guard_serial_capacity();
