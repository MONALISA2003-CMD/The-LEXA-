-- Tenant-scoped, resumable business setup; preserve all existing users, tenants, branches,
-- products, sales and accounting history. No payment gateways or transfer initiation.
CREATE TABLE business_profiles (
 tenant_id uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
 trading_name text, legal_name text, country text NOT NULL DEFAULT 'UG',
 district text, city text, physical_address text,
 online_only boolean NOT NULL DEFAULT false,
 email text, phone text, website text,
 registration_number text, tax_identification_number text,
 industry text, business_models text[] NOT NULL DEFAULT '{}',
 offering_types text[] NOT NULL DEFAULT '{}', offerings_description text,
 selling_channels text[] NOT NULL DEFAULT '{}',
 setup_step integer NOT NULL DEFAULT 1 CHECK (setup_step BETWEEN 1 AND 4),
 completed_at timestamptz(3), manual_payments_confirmed_at timestamptz(3),
 created_at timestamptz(3) NOT NULL DEFAULT now(), updated_at timestamptz(3) NOT NULL DEFAULT now()
);
CREATE TABLE business_payment_methods (
 tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 code text NOT NULL, label text NOT NULL,
 enabled boolean NOT NULL DEFAULT false,
 updated_at timestamptz(3) NOT NULL DEFAULT now(),
 PRIMARY KEY (tenant_id, code),
 CONSTRAINT business_payment_method_code_valid CHECK (code IN
   ('cash','mtn_momo','airtel_money','mobile_money','bank_transfer','card','card_recorded','cheque','other'))
);
CREATE INDEX business_payment_methods_tenant_enabled_idx ON business_payment_methods(tenant_id,enabled);
ALTER TABLE business_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_profiles FORCE ROW LEVEL SECURITY;
CREATE POLICY business_profiles_tenant_scope ON business_profiles FOR ALL
 USING (tenant_id::text=NULLIF(current_setting('app.tenant_id',true),''))
 WITH CHECK (tenant_id::text=NULLIF(current_setting('app.tenant_id',true),''));
ALTER TABLE business_payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_payment_methods FORCE ROW LEVEL SECURITY;
CREATE POLICY business_payment_methods_tenant_scope ON business_payment_methods FOR ALL
 USING (tenant_id::text=NULLIF(current_setting('app.tenant_id',true),''))
 WITH CHECK (tenant_id::text=NULLIF(current_setting('app.tenant_id',true),''));
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='lexa_app_runtime') THEN
  GRANT SELECT,INSERT,UPDATE,DELETE ON business_profiles,business_payment_methods TO lexa_app_runtime;
 END IF;
END $$;
