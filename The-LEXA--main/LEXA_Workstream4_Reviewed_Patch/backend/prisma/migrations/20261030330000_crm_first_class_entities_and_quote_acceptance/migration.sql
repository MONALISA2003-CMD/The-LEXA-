-- LEXA Workstream 4: first-class CRM entities and quote-to-order source links.
-- The generic module_records remain the UI/API compatibility surface. These tables
-- are the relational domain projection; snapshots preserve historical display values.

CREATE TABLE crm_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  module_id text NOT NULL DEFAULT 'customers' CHECK (module_id = 'customers'), record_id text NOT NULL,
  customer_code text, name text NOT NULL, customer_type text, phone text, email text, tin text,
  status text NOT NULL DEFAULT 'Active', source_lead_record_id text, snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, branch_id, id), UNIQUE (tenant_id, branch_id, record_id),
  FOREIGN KEY (tenant_id, branch_id, module_id, record_id)
    REFERENCES module_records(tenant_id, branch_id, module_id, record_id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX crm_customers_lead_conversion_uq
  ON crm_customers(tenant_id, branch_id, source_lead_record_id) WHERE source_lead_record_id IS NOT NULL;

CREATE TABLE crm_suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  module_id text NOT NULL DEFAULT 'suppliers' CHECK (module_id = 'suppliers'), record_id text NOT NULL,
  supplier_code text, name text NOT NULL, phone text, email text, tin text, status text NOT NULL DEFAULT 'Active',
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, branch_id, id), UNIQUE (tenant_id, branch_id, record_id),
  FOREIGN KEY (tenant_id, branch_id, module_id, record_id)
    REFERENCES module_records(tenant_id, branch_id, module_id, record_id) ON DELETE CASCADE
);

CREATE TABLE crm_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  module_id text NOT NULL DEFAULT 'contacts' CHECK (module_id = 'contacts'), record_id text NOT NULL,
  contact_code text, party_type text, party_record_id text, customer_entity_id uuid, supplier_entity_id uuid, lead_entity_id uuid, name text NOT NULL, job_title text, email text, phone text,
  preferred_channel text, status text NOT NULL DEFAULT 'Active', snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, branch_id, id), UNIQUE (tenant_id, branch_id, record_id),
  FOREIGN KEY (tenant_id, branch_id, module_id, record_id)
    REFERENCES module_records(tenant_id, branch_id, module_id, record_id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, branch_id, customer_entity_id) REFERENCES crm_customers(tenant_id, branch_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, branch_id, supplier_entity_id) REFERENCES crm_suppliers(tenant_id, branch_id, id) ON DELETE RESTRICT
);

CREATE TABLE crm_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  module_id text NOT NULL DEFAULT 'leads' CHECK (module_id = 'leads'), record_id text NOT NULL,
  lead_code text, company text, contact_name text, email text, phone text, source text, owner text,
  estimated_value numeric(18,2) NOT NULL DEFAULT 0, probability numeric(7,4) NOT NULL DEFAULT 0,
  campaign_record_id text, campaign_entity_id uuid, owner_team_id uuid,
  status text NOT NULL DEFAULT 'New', converted_customer_id uuid, snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, branch_id, id), UNIQUE (tenant_id, branch_id, record_id),
  FOREIGN KEY (tenant_id, branch_id, module_id, record_id)
    REFERENCES module_records(tenant_id, branch_id, module_id, record_id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, branch_id, converted_customer_id)
    REFERENCES crm_customers(tenant_id, branch_id, id) ON DELETE RESTRICT
);

CREATE TABLE crm_opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  module_id text NOT NULL DEFAULT 'opportunities' CHECK (module_id = 'opportunities'), record_id text NOT NULL,
  opportunity_code text, lead_record_id text, customer_record_id text, customer_entity_id uuid, campaign_record_id text, campaign_entity_id uuid,
  company text, owner text, amount_minor bigint NOT NULL DEFAULT 0, probability numeric(7,4) NOT NULL DEFAULT 0,
  expected_close_date date, status text NOT NULL DEFAULT 'New', snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, branch_id, id), UNIQUE (tenant_id, branch_id, record_id),
  FOREIGN KEY (tenant_id, branch_id, module_id, record_id)
    REFERENCES module_records(tenant_id, branch_id, module_id, record_id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, branch_id, lead_record_id)
    REFERENCES crm_leads(tenant_id, branch_id, record_id) ON DELETE RESTRICT
);

ALTER TABLE crm_contacts ADD CONSTRAINT crm_contacts_lead_entity_fk
  FOREIGN KEY (tenant_id, branch_id, lead_entity_id) REFERENCES crm_leads(tenant_id, branch_id, id) ON DELETE RESTRICT;

CREATE TABLE crm_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  module_id text NOT NULL DEFAULT 'campaigns' CHECK (module_id = 'campaigns'), record_id text NOT NULL,
  campaign_code text, name text NOT NULL, channel text, owner text, starts_on date, ends_on date,
  budget_minor bigint NOT NULL DEFAULT 0, actual_spend_minor bigint NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'Draft', snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, branch_id, id), UNIQUE (tenant_id, branch_id, record_id),
  FOREIGN KEY (tenant_id, branch_id, module_id, record_id)
    REFERENCES module_records(tenant_id, branch_id, module_id, record_id) ON DELETE CASCADE
);

CREATE TABLE crm_territories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE, name text NOT NULL,
  active boolean NOT NULL DEFAULT true, UNIQUE (tenant_id, branch_id, id), UNIQUE (tenant_id, branch_id, name)
);

CREATE TABLE crm_sales_teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  module_id text NOT NULL DEFAULT 'sales-teams' CHECK (module_id = 'sales-teams'), record_id text NOT NULL,
  salesperson_code text, salesperson text NOT NULL, email text, territory_id uuid,
  sales_target_minor bigint NOT NULL DEFAULT 0, sales_achieved_minor bigint NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'Active', snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, branch_id, id), UNIQUE (tenant_id, branch_id, record_id),
  FOREIGN KEY (tenant_id, branch_id, module_id, record_id)
    REFERENCES module_records(tenant_id, branch_id, module_id, record_id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, branch_id, territory_id)
    REFERENCES crm_territories(tenant_id, branch_id, id) ON DELETE RESTRICT
);

CREATE TABLE crm_quotations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  module_id text NOT NULL DEFAULT 'quotations' CHECK (module_id = 'quotations'), record_id text NOT NULL,
  quote_number text, customer_record_id text, customer_entity_id uuid, customer_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_opportunity_record_id text, source_lead_record_id text,
  issue_date date, valid_until date, currency char(3) NOT NULL DEFAULT 'UGX',
  subtotal_minor bigint NOT NULL DEFAULT 0, tax_minor bigint NOT NULL DEFAULT 0, total_minor bigint NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'Draft', accepted_order_id uuid, snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, branch_id, id), UNIQUE (tenant_id, branch_id, record_id),
  FOREIGN KEY (tenant_id, branch_id, module_id, record_id)
    REFERENCES module_records(tenant_id, branch_id, module_id, record_id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, branch_id, customer_entity_id)
    REFERENCES crm_customers(tenant_id, branch_id, id) ON DELETE RESTRICT
);

CREATE TABLE crm_quotation_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, branch_id uuid NOT NULL,
  quotation_id uuid NOT NULL, quote_record_id text NOT NULL, source_line_key text NOT NULL,
  product_id uuid, product_name_snapshot text NOT NULL, quantity numeric(12,3) NOT NULL CHECK (quantity > 0),
  unit_price_minor bigint NOT NULL CHECK (unit_price_minor >= 0), line_total_minor bigint NOT NULL CHECK (line_total_minor >= 0),
  line_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (tenant_id, branch_id, id), UNIQUE (tenant_id, branch_id, quote_record_id, source_line_key),
  FOREIGN KEY (tenant_id, branch_id, quotation_id)
    REFERENCES crm_quotations(tenant_id, branch_id, id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
);
ALTER TABLE crm_leads ADD CONSTRAINT crm_leads_campaign_entity_fk FOREIGN KEY (tenant_id, branch_id, campaign_entity_id) REFERENCES crm_campaigns(tenant_id, branch_id, id) ON DELETE RESTRICT;
ALTER TABLE crm_leads ADD CONSTRAINT crm_leads_owner_team_fk FOREIGN KEY (tenant_id, branch_id, owner_team_id) REFERENCES crm_sales_teams(tenant_id, branch_id, id) ON DELETE RESTRICT;
ALTER TABLE crm_opportunities ADD CONSTRAINT crm_opportunities_customer_fk FOREIGN KEY (tenant_id, branch_id, customer_entity_id) REFERENCES crm_customers(tenant_id, branch_id, id) ON DELETE RESTRICT;
ALTER TABLE crm_opportunities ADD CONSTRAINT crm_opportunities_campaign_fk FOREIGN KEY (tenant_id, branch_id, campaign_entity_id) REFERENCES crm_campaigns(tenant_id, branch_id, id) ON DELETE RESTRICT;
CREATE INDEX crm_leads_pipeline_idx ON crm_leads(tenant_id, branch_id, status, updated_at DESC);
CREATE INDEX crm_opportunities_pipeline_idx ON crm_opportunities(tenant_id, branch_id, status, expected_close_date);
CREATE INDEX crm_contacts_party_idx ON crm_contacts(tenant_id, branch_id, party_type, party_record_id);
CREATE INDEX crm_quotes_status_idx ON crm_quotations(tenant_id, branch_id, status, valid_until);

-- Existing PriceList/PriceListItem tables are the authoritative pricing entities.
ALTER TABLE price_lists ADD COLUMN record_id text;
ALTER TABLE price_lists ADD COLUMN applies_to text;
ALTER TABLE price_lists ADD COLUMN customer_record_id text;
ALTER TABLE price_lists ADD COLUMN snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE UNIQUE INDEX price_lists_tenant_record_uq ON price_lists(tenant_id, record_id);

-- Stable entity references and quote source references on downstream operational documents.
ALTER TABLE commerce_sales_orders ADD COLUMN crm_customer_id uuid;
ALTER TABLE commerce_sales_orders ADD COLUMN quotation_id uuid;
ALTER TABLE commerce_sales_orders ADD COLUMN source_quote_record_id text;
CREATE UNIQUE INDEX commerce_sales_orders_tenant_branch_id_uq ON commerce_sales_orders(tenant_id, branch_id, id);
ALTER TABLE commerce_sales_order_lines ADD COLUMN branch_id uuid;
UPDATE commerce_sales_order_lines l SET branch_id = o.branch_id FROM commerce_sales_orders o WHERE o.id = l.order_id AND l.branch_id IS NULL;
ALTER TABLE commerce_sales_order_lines ALTER COLUMN branch_id SET NOT NULL;
ALTER TABLE commerce_sales_order_lines ADD COLUMN source_quote_line_id uuid;
ALTER TABLE sales ADD COLUMN customer_record_id text;
ALTER TABLE sales ADD COLUMN crm_customer_id uuid;
ALTER TABLE ar_customer_invoices ADD COLUMN crm_customer_id uuid;
ALTER TABLE commerce_purchase_orders ADD COLUMN crm_supplier_id uuid;
ALTER TABLE ap_supplier_invoices ADD COLUMN crm_supplier_id uuid;
ALTER TABLE ap_supplier_payments ADD COLUMN crm_supplier_id uuid;
CREATE UNIQUE INDEX commerce_sales_orders_quote_source_uq
  ON commerce_sales_orders(tenant_id, branch_id, source_quote_record_id) WHERE source_quote_record_id IS NOT NULL;
CREATE UNIQUE INDEX commerce_sales_order_quote_line_uq
  ON commerce_sales_order_lines(tenant_id, order_id, source_quote_line_id) WHERE source_quote_line_id IS NOT NULL;
ALTER TABLE commerce_sales_orders ADD CONSTRAINT commerce_sales_orders_crm_customer_fk
  FOREIGN KEY (tenant_id, branch_id, crm_customer_id) REFERENCES crm_customers(tenant_id, branch_id, id) ON DELETE RESTRICT;
ALTER TABLE commerce_sales_orders ADD CONSTRAINT commerce_sales_orders_quotation_fk
  FOREIGN KEY (tenant_id, branch_id, quotation_id) REFERENCES crm_quotations(tenant_id, branch_id, id) ON DELETE RESTRICT;
ALTER TABLE commerce_sales_order_lines ADD CONSTRAINT commerce_sales_order_lines_quote_line_fk
  FOREIGN KEY (tenant_id, branch_id, source_quote_line_id) REFERENCES crm_quotation_lines(tenant_id, branch_id, id) ON DELETE RESTRICT;
ALTER TABLE sales ADD CONSTRAINT sales_crm_customer_fk
  FOREIGN KEY (tenant_id, branch_id, crm_customer_id) REFERENCES crm_customers(tenant_id, branch_id, id) ON DELETE RESTRICT;
ALTER TABLE ar_customer_invoices ADD CONSTRAINT ar_invoices_crm_customer_fk
  FOREIGN KEY (tenant_id, branch_id, crm_customer_id) REFERENCES crm_customers(tenant_id, branch_id, id) ON DELETE RESTRICT;
ALTER TABLE commerce_purchase_orders ADD CONSTRAINT commerce_purchase_orders_crm_supplier_fk
  FOREIGN KEY (tenant_id, branch_id, crm_supplier_id) REFERENCES crm_suppliers(tenant_id, branch_id, id) ON DELETE RESTRICT;
ALTER TABLE ap_supplier_invoices ADD CONSTRAINT ap_supplier_invoices_crm_supplier_fk
  FOREIGN KEY (tenant_id, branch_id, crm_supplier_id) REFERENCES crm_suppliers(tenant_id, branch_id, id) ON DELETE RESTRICT;
ALTER TABLE ap_supplier_payments ADD CONSTRAINT ap_supplier_payments_crm_supplier_fk
  FOREIGN KEY (tenant_id, branch_id, crm_supplier_id) REFERENCES crm_suppliers(tenant_id, branch_id, id) ON DELETE RESTRICT;
ALTER TABLE crm_quotations ADD CONSTRAINT crm_quotations_accepted_order_fk
  FOREIGN KEY (tenant_id, branch_id, accepted_order_id) REFERENCES commerce_sales_orders(tenant_id, branch_id, id) ON DELETE RESTRICT;

-- Project generic module records into normalized CRM tables. Generic records remain the
-- API/UI compatibility layer; relational projections become the source for stable IDs.
CREATE OR REPLACE FUNCTION lexa_sync_crm_module_record() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  d jsonb; v_name text; v_currency text; v_factor numeric; v_total numeric; v_subtotal numeric;
  v_customer_id uuid; v_territory_id uuid; v_product_id uuid; v_product_count integer;
  v_party_type text; v_party_record_id text; v_opportunity_record_id text; v_lead_record_id text;
  v_lines jsonb; v_line jsonb; v_key text; v_keys text[]; v_qty numeric; v_unit numeric; v_unit_minor bigint; v_i integer;
BEGIN
  IF TG_OP = 'DELETE' THEN
    CASE OLD.module_id
      WHEN 'customers' THEN DELETE FROM crm_customers WHERE tenant_id=OLD.tenant_id AND branch_id=OLD.branch_id AND record_id=OLD.record_id;
      WHEN 'suppliers' THEN DELETE FROM crm_suppliers WHERE tenant_id=OLD.tenant_id AND branch_id=OLD.branch_id AND record_id=OLD.record_id;
      WHEN 'contacts' THEN DELETE FROM crm_contacts WHERE tenant_id=OLD.tenant_id AND branch_id=OLD.branch_id AND record_id=OLD.record_id;
      WHEN 'leads' THEN DELETE FROM crm_leads WHERE tenant_id=OLD.tenant_id AND branch_id=OLD.branch_id AND record_id=OLD.record_id;
      WHEN 'opportunities' THEN DELETE FROM crm_opportunities WHERE tenant_id=OLD.tenant_id AND branch_id=OLD.branch_id AND record_id=OLD.record_id;
      WHEN 'campaigns' THEN DELETE FROM crm_campaigns WHERE tenant_id=OLD.tenant_id AND branch_id=OLD.branch_id AND record_id=OLD.record_id;
      WHEN 'sales-teams' THEN DELETE FROM crm_sales_teams WHERE tenant_id=OLD.tenant_id AND branch_id=OLD.branch_id AND record_id=OLD.record_id;
      WHEN 'quotations' THEN DELETE FROM crm_quotations WHERE tenant_id=OLD.tenant_id AND branch_id=OLD.branch_id AND record_id=OLD.record_id;
      WHEN 'price-lists' THEN DELETE FROM price_list_items WHERE tenant_id=OLD.tenant_id AND price_list_id=(SELECT id FROM price_lists WHERE tenant_id=OLD.tenant_id AND record_id=OLD.record_id); DELETE FROM price_lists WHERE tenant_id=OLD.tenant_id AND record_id=OLD.record_id;
    ELSE NULL;
    END CASE;
    RETURN OLD;
  END IF;
  d := NEW.data;
  CASE NEW.module_id
  WHEN 'customers' THEN
    INSERT INTO crm_customers(tenant_id,branch_id,record_id,customer_code,name,customer_type,phone,email,tin,status,source_lead_record_id,snapshot)
    VALUES(NEW.tenant_id,NEW.branch_id,NEW.record_id,d->>'customerCode',COALESCE(NULLIF(d->>'name',''),NULLIF(d->>'company',''),NEW.record_id),d->>'customerType',d->>'phone',d->>'email',d->>'tin',COALESCE(d->>'status','Active'),d->>'sourceLeadId',d)
    ON CONFLICT(tenant_id,branch_id,record_id) DO UPDATE SET customer_code=EXCLUDED.customer_code,name=EXCLUDED.name,customer_type=EXCLUDED.customer_type,phone=EXCLUDED.phone,email=EXCLUDED.email,tin=EXCLUDED.tin,status=EXCLUDED.status,source_lead_record_id=COALESCE(EXCLUDED.source_lead_record_id,crm_customers.source_lead_record_id),snapshot=EXCLUDED.snapshot,updated_at=now();
    UPDATE crm_leads l SET converted_customer_id=c.id FROM crm_customers c WHERE l.tenant_id=c.tenant_id AND l.branch_id=c.branch_id AND l.record_id=c.source_lead_record_id AND c.tenant_id=NEW.tenant_id AND c.branch_id=NEW.branch_id;
    UPDATE crm_contacts SET customer_entity_id=(SELECT id FROM crm_customers WHERE tenant_id=NEW.tenant_id AND branch_id=NEW.branch_id AND record_id=NEW.record_id) WHERE tenant_id=NEW.tenant_id AND branch_id=NEW.branch_id AND party_record_id=NEW.record_id AND party_type='customers';
    UPDATE crm_opportunities SET customer_record_id=NEW.record_id,customer_entity_id=(SELECT id FROM crm_customers WHERE tenant_id=NEW.tenant_id AND branch_id=NEW.branch_id AND record_id=NEW.record_id) WHERE tenant_id=NEW.tenant_id AND branch_id=NEW.branch_id AND customer_record_id=NEW.record_id;
    UPDATE crm_opportunities o SET customer_record_id=NEW.record_id,customer_entity_id=c.id FROM crm_customers c WHERE o.tenant_id=NEW.tenant_id AND o.branch_id=NEW.branch_id AND o.lead_record_id=NEW.source_lead_record_id AND c.tenant_id=o.tenant_id AND c.branch_id=o.branch_id AND c.record_id=NEW.record_id;
    UPDATE crm_quotations q SET customer_entity_id=c.id FROM crm_customers c WHERE q.tenant_id=c.tenant_id AND q.branch_id=c.branch_id AND q.customer_entity_id IS NULL AND (q.customer_record_id=c.record_id OR lower(q.snapshot->>'customer')=lower(c.name)) AND c.tenant_id=NEW.tenant_id AND c.branch_id=NEW.branch_id;
    UPDATE crm_quotations q SET customer_record_id=c.record_id,customer_entity_id=c.id,customer_snapshot=c.snapshot FROM crm_opportunities o JOIN crm_customers c ON c.tenant_id=o.tenant_id AND c.branch_id=o.branch_id AND c.record_id=NEW.record_id WHERE q.tenant_id=NEW.tenant_id AND q.branch_id=NEW.branch_id AND q.source_opportunity_record_id=o.record_id AND o.tenant_id=NEW.tenant_id AND o.branch_id=NEW.branch_id AND o.lead_record_id=NEW.source_lead_record_id;
  WHEN 'suppliers' THEN
    INSERT INTO crm_suppliers(tenant_id,branch_id,record_id,supplier_code,name,phone,email,tin,status,snapshot)
    VALUES(NEW.tenant_id,NEW.branch_id,NEW.record_id,d->>'supplierCode',COALESCE(NULLIF(d->>'name',''),NULLIF(d->>'supplierName',''),NEW.record_id),d->>'phone',d->>'email',d->>'tin',COALESCE(d->>'status','Active'),d)
    ON CONFLICT(tenant_id,branch_id,record_id) DO UPDATE SET supplier_code=EXCLUDED.supplier_code,name=EXCLUDED.name,phone=EXCLUDED.phone,email=EXCLUDED.email,tin=EXCLUDED.tin,status=EXCLUDED.status,snapshot=EXCLUDED.snapshot,updated_at=now();
    UPDATE crm_contacts SET supplier_entity_id=(SELECT id FROM crm_suppliers WHERE tenant_id=NEW.tenant_id AND branch_id=NEW.branch_id AND record_id=NEW.record_id) WHERE tenant_id=NEW.tenant_id AND branch_id=NEW.branch_id AND party_record_id=NEW.record_id AND party_type='suppliers';
  WHEN 'contacts' THEN
    v_party_type := lower(trim(COALESCE(NULLIF(d->>'sourceModuleId',''),NULLIF(d->>'partyType',''),'other')));
    v_party_type := CASE v_party_type WHEN 'customer' THEN 'customers' WHEN 'customers' THEN 'customers' WHEN 'supplier' THEN 'suppliers' WHEN 'suppliers' THEN 'suppliers' WHEN 'lead' THEN 'leads' WHEN 'leads' THEN 'leads' WHEN 'employee' THEN 'employees' WHEN 'employees' THEN 'employees' ELSE v_party_type END;
    v_party_record_id := COALESCE(NULLIF(d->>'partyRecordId',''),NULLIF(d->>'partyId',''),NULLIF(d->>'sourceRecordId',''));
    IF v_party_record_id IS NULL AND NULLIF(d->>'partyName','') IS NOT NULL THEN
      IF v_party_type='customers' THEN
        SELECT min(record_id) INTO v_party_record_id FROM crm_customers WHERE tenant_id=NEW.tenant_id AND branch_id=NEW.branch_id AND lower(name)=lower(d->>'partyName') HAVING count(*)=1;
      ELSIF v_party_type='suppliers' THEN
        SELECT min(record_id) INTO v_party_record_id FROM crm_suppliers WHERE tenant_id=NEW.tenant_id AND branch_id=NEW.branch_id AND lower(name)=lower(d->>'partyName') HAVING count(*)=1;
      ELSIF v_party_type='leads' THEN
        SELECT min(record_id) INTO v_party_record_id FROM crm_leads WHERE tenant_id=NEW.tenant_id AND branch_id=NEW.branch_id AND lower(company)=lower(d->>'partyName') HAVING count(*)=1;
      END IF;
    END IF;
    INSERT INTO crm_contacts(tenant_id,branch_id,record_id,contact_code,party_type,party_record_id,customer_entity_id,supplier_entity_id,lead_entity_id,name,job_title,email,phone,preferred_channel,status,snapshot)
    VALUES(NEW.tenant_id,NEW.branch_id,NEW.record_id,d->>'contactCode',v_party_type,v_party_record_id,
      (SELECT id FROM crm_customers WHERE tenant_id=NEW.tenant_id AND branch_id=NEW.branch_id AND record_id=v_party_record_id AND v_party_type='customers'),
      (SELECT id FROM crm_suppliers WHERE tenant_id=NEW.tenant_id AND branch_id=NEW.branch_id AND record_id=v_party_record_id AND v_party_type='suppliers'),
      (SELECT id FROM crm_leads WHERE tenant_id=NEW.tenant_id AND branch_id=NEW.branch_id AND record_id=v_party_record_id AND v_party_type='leads'),
      COALESCE(NULLIF(d->>'contactName',''),d->>'name',NEW.record_id),d->>'jobTitle',d->>'email',d->>'phone',d->>'preferredChannel',COALESCE(d->>'status','Active'),d)
    ON CONFLICT(tenant_id,branch_id,record_id) DO UPDATE SET contact_code=EXCLUDED.contact_code,party_type=EXCLUDED.party_type,party_record_id=EXCLUDED.party_record_id,customer_entity_id=EXCLUDED.customer_entity_id,supplier_entity_id=EXCLUDED.supplier_entity_id,lead_entity_id=EXCLUDED.lead_entity_id,name=EXCLUDED.name,job_title=EXCLUDED.job_title,email=EXCLUDED.email,phone=EXCLUDED.phone,preferred_channel=EXCLUDED.preferred_channel,status=EXCLUDED.status,snapshot=EXCLUDED.snapshot,updated_at=now();
  WHEN 'leads' THEN
    INSERT INTO crm_leads(tenant_id,branch_id,record_id,lead_code,company,contact_name,email,phone,source,owner,estimated_value,probability,campaign_record_id,campaign_entity_id,owner_team_id,status,snapshot)
    VALUES(NEW.tenant_id,NEW.branch_id,NEW.record_id,d->>'leadCode',COALESCE(d->>'company',d->>'name',d->>'leadName',NEW.record_id),d->>'contactName',d->>'email',d->>'phone',d->>'source',d->>'owner',CASE WHEN COALESCE(d->>'estimatedValue','') ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (d->>'estimatedValue')::numeric ELSE 0 END,CASE WHEN COALESCE(d->>'probability','') ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (d->>'probability')::numeric ELSE 0 END,COALESCE(NULLIF(d->>'campaignRecordId',''),CASE WHEN d->>'sourceModuleId'='campaigns' THEN d->>'sourceRecordId' END),(SELECT id FROM crm_campaigns WHERE tenant_id=NEW.tenant_id AND branch_id=NEW.branch_id AND record_id=COALESCE(NULLIF(d->>'campaignRecordId',''),CASE WHEN d->>'sourceModuleId'='campaigns' THEN d->>'sourceRecordId' END)),(SELECT id FROM crm_sales_teams WHERE tenant_id=NEW.tenant_id AND branch_id=NEW.branch_id AND salesperson=COALESCE(d->>'owner','')),COALESCE(d->>'status','New'),d)
    ON CONFLICT(tenant_id,branch_id,record_id) DO UPDATE SET lead_code=EXCLUDED.lead_code,company=EXCLUDED.company,contact_name=EXCLUDED.contact_name,email=EXCLUDED.email,phone=EXCLUDED.phone,source=EXCLUDED.source,owner=EXCLUDED.owner,estimated_value=EXCLUDED.estimated_value,probability=EXCLUDED.probability,campaign_record_id=EXCLUDED.campaign_record_id,campaign_entity_id=EXCLUDED.campaign_entity_id,owner_team_id=EXCLUDED.owner_team_id,status=EXCLUDED.status,snapshot=EXCLUDED.snapshot,updated_at=now();
    UPDATE crm_leads l SET converted_customer_id=c.id FROM crm_customers c WHERE l.tenant_id=c.tenant_id AND l.branch_id=c.branch_id AND l.record_id=c.source_lead_record_id AND l.tenant_id=NEW.tenant_id AND l.branch_id=NEW.branch_id;
    UPDATE crm_opportunities SET lead_record_id=NEW.record_id WHERE tenant_id=NEW.tenant_id AND branch_id=NEW.branch_id AND lead_record_id=NEW.record_id;
    UPDATE crm_contacts SET lead_entity_id=(SELECT id FROM crm_leads WHERE tenant_id=NEW.tenant_id AND branch_id=NEW.branch_id AND record_id=NEW.record_id) WHERE tenant_id=NEW.tenant_id AND branch_id=NEW.branch_id AND party_record_id=NEW.record_id AND party_type='leads';
  WHEN 'opportunities' THEN
    INSERT INTO crm_opportunities(tenant_id,branch_id,record_id,opportunity_code,lead_record_id,customer_record_id,customer_entity_id,campaign_record_id,campaign_entity_id,company,owner,amount_minor,probability,expected_close_date,status,snapshot)
    VALUES(NEW.tenant_id,NEW.branch_id,NEW.record_id,d->>'opportunityCode',COALESCE(NULLIF(d->>'leadRecordId',''),CASE WHEN d->>'sourceModuleId'='leads' THEN d->>'sourceRecordId' END),COALESCE(NULLIF(d->>'customerRecordId',''),CASE WHEN d->>'sourceModuleId'='customers' THEN d->>'sourceRecordId' END),(SELECT id FROM crm_customers WHERE tenant_id=NEW.tenant_id AND branch_id=NEW.branch_id AND record_id=COALESCE(NULLIF(d->>'customerRecordId',''),CASE WHEN d->>'sourceModuleId'='customers' THEN d->>'sourceRecordId' END)),COALESCE(NULLIF(d->>'campaignRecordId',''),CASE WHEN d->>'sourceModuleId'='campaigns' THEN d->>'sourceRecordId' END),(SELECT id FROM crm_campaigns WHERE tenant_id=NEW.tenant_id AND branch_id=NEW.branch_id AND record_id=COALESCE(NULLIF(d->>'campaignRecordId',''),CASE WHEN d->>'sourceModuleId'='campaigns' THEN d->>'sourceRecordId' END)),COALESCE(d->>'company',d->>'customer',NEW.record_id),d->>'owner',CASE WHEN COALESCE(d->>'amount','') ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN round((d->>'amount')::numeric*100)::bigint ELSE 0 END,CASE WHEN COALESCE(d->>'probability','') ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (d->>'probability')::numeric ELSE 0 END,CASE WHEN COALESCE(d->>'expectedCloseDate','') ~ '^\\d{4}-\\d{2}-\\d{2}$' THEN (d->>'expectedCloseDate')::date ELSE NULL END,COALESCE(d->>'status','New'),d)
    ON CONFLICT(tenant_id,branch_id,record_id) DO UPDATE SET opportunity_code=EXCLUDED.opportunity_code,lead_record_id=EXCLUDED.lead_record_id,customer_record_id=EXCLUDED.customer_record_id,customer_entity_id=EXCLUDED.customer_entity_id,campaign_record_id=EXCLUDED.campaign_record_id,campaign_entity_id=EXCLUDED.campaign_entity_id,company=EXCLUDED.company,owner=EXCLUDED.owner,amount_minor=EXCLUDED.amount_minor,probability=EXCLUDED.probability,expected_close_date=EXCLUDED.expected_close_date,status=EXCLUDED.status,snapshot=EXCLUDED.snapshot,updated_at=now();
  WHEN 'campaigns' THEN
    INSERT INTO crm_campaigns(tenant_id,branch_id,record_id,campaign_code,name,channel,owner,starts_on,ends_on,budget_minor,actual_spend_minor,status,snapshot)
    VALUES(NEW.tenant_id,NEW.branch_id,NEW.record_id,d->>'campaignCode',COALESCE(d->>'name',NEW.record_id),d->>'channel',d->>'owner',CASE WHEN COALESCE(d->>'startDate','') ~ '^\\d{4}-\\d{2}-\\d{2}$' THEN (d->>'startDate')::date ELSE NULL END,CASE WHEN COALESCE(d->>'endDate','') ~ '^\\d{4}-\\d{2}-\\d{2}$' THEN (d->>'endDate')::date ELSE NULL END,CASE WHEN COALESCE(d->>'budget','') ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN round((d->>'budget')::numeric*100)::bigint ELSE 0 END,CASE WHEN COALESCE(d->>'actualSpend','') ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN round((d->>'actualSpend')::numeric*100)::bigint ELSE 0 END,COALESCE(d->>'status','Draft'),d)
    ON CONFLICT(tenant_id,branch_id,record_id) DO UPDATE SET campaign_code=EXCLUDED.campaign_code,name=EXCLUDED.name,channel=EXCLUDED.channel,owner=EXCLUDED.owner,starts_on=EXCLUDED.starts_on,ends_on=EXCLUDED.ends_on,budget_minor=EXCLUDED.budget_minor,actual_spend_minor=EXCLUDED.actual_spend_minor,status=EXCLUDED.status,snapshot=EXCLUDED.snapshot,updated_at=now();
    UPDATE crm_leads SET campaign_entity_id=(SELECT id FROM crm_campaigns WHERE tenant_id=NEW.tenant_id AND branch_id=NEW.branch_id AND record_id=NEW.record_id) WHERE tenant_id=NEW.tenant_id AND branch_id=NEW.branch_id AND campaign_record_id=NEW.record_id;
    UPDATE crm_opportunities SET campaign_entity_id=(SELECT id FROM crm_campaigns WHERE tenant_id=NEW.tenant_id AND branch_id=NEW.branch_id AND record_id=NEW.record_id) WHERE tenant_id=NEW.tenant_id AND branch_id=NEW.branch_id AND campaign_record_id=NEW.record_id;
  WHEN 'sales-teams' THEN
    v_name := NULLIF(trim(d->>'territory'),''); v_territory_id := NULL;
    IF v_name IS NOT NULL THEN INSERT INTO crm_territories(tenant_id,branch_id,name) VALUES(NEW.tenant_id,NEW.branch_id,v_name) ON CONFLICT(tenant_id,branch_id,name) DO UPDATE SET active=true RETURNING id INTO v_territory_id; END IF;
    INSERT INTO crm_sales_teams(tenant_id,branch_id,record_id,salesperson_code,salesperson,email,territory_id,sales_target_minor,sales_achieved_minor,status,snapshot)
    VALUES(NEW.tenant_id,NEW.branch_id,NEW.record_id,d->>'salespersonCode',COALESCE(d->>'salesperson',d->>'name',NEW.record_id),d->>'email',v_territory_id,CASE WHEN COALESCE(d->>'salesTarget','') ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN round((d->>'salesTarget')::numeric*100)::bigint ELSE 0 END,CASE WHEN COALESCE(d->>'salesAchieved','') ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN round((d->>'salesAchieved')::numeric*100)::bigint ELSE 0 END,COALESCE(d->>'status','Active'),d)
    ON CONFLICT(tenant_id,branch_id,record_id) DO UPDATE SET salesperson_code=EXCLUDED.salesperson_code,salesperson=EXCLUDED.salesperson,email=EXCLUDED.email,territory_id=EXCLUDED.territory_id,sales_target_minor=EXCLUDED.sales_target_minor,sales_achieved_minor=EXCLUDED.sales_achieved_minor,status=EXCLUDED.status,snapshot=EXCLUDED.snapshot,updated_at=now();
  WHEN 'price-lists' THEN
    SELECT currency INTO v_currency FROM tenants WHERE id=NEW.tenant_id;
    v_currency:=COALESCE(NULLIF(d->>'currency',''),v_currency,'UGX');
    v_factor:=CASE WHEN v_currency IN ('UGX','JPY','KRW') THEN 1 ELSE 100 END;
    v_name:=COALESCE(NULLIF(d->>'listName',''),NULLIF(d->>'name',''),NEW.record_id);
    v_party_record_id:=NULLIF(d->>'customerRecordId','');
    IF v_party_record_id IS NULL AND d->>'appliesTo'='Named customer' AND NULLIF(d->>'customerOrGroup','') IS NOT NULL THEN
      SELECT min(record_id) INTO v_party_record_id FROM crm_customers WHERE tenant_id=NEW.tenant_id AND branch_id=NEW.branch_id AND lower(name)=lower(d->>'customerOrGroup') HAVING count(*)=1;
    END IF;
    INSERT INTO price_lists(id,tenant_id,code,name,currency,starts_at,ends_at,active,record_id,applies_to,customer_record_id,snapshot)
    VALUES(CASE WHEN NEW.record_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN NEW.record_id::uuid ELSE gen_random_uuid() END,NEW.tenant_id,COALESCE(NULLIF(d->>'priceListCode',''),NEW.record_id),v_name,v_currency,CASE WHEN COALESCE(d->>'validFrom','') ~ '^\\d{4}-\\d{2}-\\d{2}$' THEN (d->>'validFrom')::date::timestamp AT TIME ZONE 'UTC' ELSE NULL END,CASE WHEN COALESCE(d->>'validUntil','') ~ '^\\d{4}-\\d{2}-\\d{2}$' THEN (d->>'validUntil')::date::timestamp AT TIME ZONE 'UTC' ELSE NULL END,COALESCE(d->>'status','Draft')='Active',NEW.record_id,d->>'appliesTo',v_party_record_id,d)
    ON CONFLICT(tenant_id,record_id) DO UPDATE SET code=EXCLUDED.code,name=EXCLUDED.name,currency=EXCLUDED.currency,starts_at=EXCLUDED.starts_at,ends_at=EXCLUDED.ends_at,active=EXCLUDED.active,applies_to=EXCLUDED.applies_to,customer_record_id=EXCLUDED.customer_record_id,snapshot=EXCLUDED.snapshot;
    DELETE FROM price_list_items WHERE tenant_id=NEW.tenant_id AND price_list_id=(SELECT id FROM price_lists WHERE tenant_id=NEW.tenant_id AND record_id=NEW.record_id);
    SELECT count(*) INTO v_product_count FROM products WHERE tenant_id=NEW.tenant_id AND active AND (lower(name)=lower(COALESCE(d->>'productOrCategory','')) OR lower(sku)=lower(COALESCE(d->>'productOrCategory','')));
    IF v_product_count=1 AND COALESCE(d->>'sellingPrice','') ~ '^[0-9]+(\\.[0-9]+)?$' THEN
      INSERT INTO price_list_items(id,tenant_id,price_list_id,product_id,variant_id,unit_price_minor,tax_code_id)
      SELECT gen_random_uuid(),NEW.tenant_id,pl.id,p.id,NULL,round((d->>'sellingPrice')::numeric*v_factor)::integer,NULL
      FROM price_lists pl JOIN products p ON p.tenant_id=NEW.tenant_id AND p.active AND (lower(p.name)=lower(COALESCE(d->>'productOrCategory','')) OR lower(p.sku)=lower(COALESCE(d->>'productOrCategory','')))
      WHERE pl.tenant_id=NEW.tenant_id AND pl.record_id=NEW.record_id;
    END IF;
  WHEN 'quotations' THEN
    SELECT t.currency INTO v_currency FROM tenants t WHERE t.id=NEW.tenant_id;
    v_factor := CASE WHEN COALESCE(v_currency,'UGX') IN ('UGX','JPY','KRW') THEN 1 ELSE 100 END;
    v_name := NULLIF(trim(d->>'customer'),'');
    v_customer_id := NULL;
    v_opportunity_record_id := CASE WHEN d->>'sourceModuleId'='opportunities' THEN NULLIF(d->>'sourceRecordId','') END;
    v_party_record_id := COALESCE(NULLIF(d->>'customerRecordId',''),CASE WHEN d->>'sourceModuleId'='customers' THEN NULLIF(d->>'sourceRecordId','') END);
    v_lead_record_id := NULLIF(d->>'leadRecordId','');
    IF v_opportunity_record_id IS NOT NULL THEN
      SELECT o.customer_record_id,o.lead_record_id,o.customer_entity_id INTO v_party_record_id,v_lead_record_id,v_customer_id
        FROM crm_opportunities o WHERE o.tenant_id=NEW.tenant_id AND o.branch_id=NEW.branch_id AND o.record_id=v_opportunity_record_id;
    ELSIF d->>'sourceModuleId'='leads' AND NULLIF(d->>'sourceRecordId','') IS NOT NULL THEN
      v_lead_record_id := d->>'sourceRecordId';
      SELECT l.converted_customer_id INTO v_customer_id FROM crm_leads l WHERE l.tenant_id=NEW.tenant_id AND l.branch_id=NEW.branch_id AND l.record_id=v_lead_record_id;
      IF v_customer_id IS NOT NULL THEN SELECT record_id INTO v_party_record_id FROM crm_customers WHERE tenant_id=NEW.tenant_id AND branch_id=NEW.branch_id AND id=v_customer_id; END IF;
    END IF;
    IF v_customer_id IS NULL AND v_party_record_id IS NOT NULL THEN
      SELECT c.id INTO v_customer_id FROM crm_customers c
       WHERE c.tenant_id=NEW.tenant_id AND c.branch_id=NEW.branch_id AND c.record_id=v_party_record_id AND c.status='Active';
    ELSIF v_name IS NOT NULL AND v_customer_id IS NULL THEN
      SELECT count(*) INTO v_product_count FROM crm_customers c
       WHERE c.tenant_id=NEW.tenant_id AND c.branch_id=NEW.branch_id AND lower(c.name)=lower(v_name) AND c.status='Active';
      IF v_product_count=1 THEN
        SELECT c.id INTO v_customer_id FROM crm_customers c
         WHERE c.tenant_id=NEW.tenant_id AND c.branch_id=NEW.branch_id AND lower(c.name)=lower(v_name) AND c.status='Active' LIMIT 1;
      END IF;
    END IF;
    v_total := CASE WHEN COALESCE(d->>'total','') ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN round((d->>'total')::numeric*v_factor) ELSE 0 END;
    v_subtotal := CASE WHEN COALESCE(d->>'subtotal','') ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN round((d->>'subtotal')::numeric*v_factor) ELSE v_total END;
    INSERT INTO crm_quotations(tenant_id,branch_id,record_id,quote_number,customer_record_id,customer_entity_id,customer_snapshot,source_opportunity_record_id,source_lead_record_id,issue_date,valid_until,currency,subtotal_minor,tax_minor,total_minor,status,snapshot)
    VALUES(NEW.tenant_id,NEW.branch_id,NEW.record_id,d->>'quoteNumber',v_party_record_id,v_customer_id,COALESCE((SELECT snapshot FROM crm_customers WHERE id=v_customer_id),'{}'::jsonb),v_opportunity_record_id,v_lead_record_id,CASE WHEN COALESCE(d->>'issueDate','') ~ '^\\d{4}-\\d{2}-\\d{2}$' THEN (d->>'issueDate')::date ELSE NULL END,CASE WHEN COALESCE(d->>'validUntil','') ~ '^\\d{4}-\\d{2}-\\d{2}$' THEN (d->>'validUntil')::date ELSE NULL END,COALESCE(v_currency,'UGX'),v_subtotal,CASE WHEN COALESCE(d->>'taxAmount','') ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN GREATEST(round((d->>'taxAmount')::numeric*v_factor),0) ELSE GREATEST(v_total-v_subtotal,0) END,v_total,COALESCE(d->>'status','Draft'),d)
    ON CONFLICT(tenant_id,branch_id,record_id) DO UPDATE SET quote_number=EXCLUDED.quote_number,customer_record_id=EXCLUDED.customer_record_id,customer_entity_id=EXCLUDED.customer_entity_id,customer_snapshot=EXCLUDED.customer_snapshot,source_opportunity_record_id=EXCLUDED.source_opportunity_record_id,source_lead_record_id=EXCLUDED.source_lead_record_id,issue_date=EXCLUDED.issue_date,valid_until=EXCLUDED.valid_until,currency=EXCLUDED.currency,subtotal_minor=EXCLUDED.subtotal_minor,tax_minor=EXCLUDED.tax_minor,total_minor=EXCLUDED.total_minor,status=EXCLUDED.status,snapshot=EXCLUDED.snapshot,updated_at=now();
    v_lines := '[]'::jsonb; BEGIN v_lines := COALESCE(NULLIF(d->>'lineItemsJson','')::jsonb,'[]'::jsonb); EXCEPTION WHEN others THEN v_lines := '[]'::jsonb; END;
    v_keys := '{}'::text[]; v_i := 0;
    IF jsonb_typeof(v_lines)='array' THEN
      FOR v_line IN SELECT value FROM jsonb_array_elements(v_lines) LOOP
        v_i := v_i + 1; v_key := COALESCE(NULLIF(v_line->>'id',''),md5(NEW.record_id||':'||COALESCE(v_line->>'description','')||':'||v_i::text));
        v_qty := CASE WHEN COALESCE(v_line->>'quantity','') ~ '^[0-9]+(\\.[0-9]+)?$' THEN (v_line->>'quantity')::numeric ELSE 0 END;
        v_unit := CASE WHEN COALESCE(v_line->>'unitAmount','') ~ '^[0-9]+(\\.[0-9]+)?$' THEN (v_line->>'unitAmount')::numeric ELSE 0 END;
        v_unit_minor := round(v_unit*v_factor)::bigint; v_product_id := NULL;
        IF COALESCE(v_line->>'productId','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
          SELECT id INTO v_product_id FROM products WHERE tenant_id=NEW.tenant_id AND id=(v_line->>'productId')::uuid AND active;
        ELSE
          SELECT count(*) INTO v_product_count FROM products WHERE tenant_id=NEW.tenant_id AND active AND (lower(name)=lower(COALESCE(v_line->>'description','')) OR lower(sku)=lower(COALESCE(v_line->>'description','')));
          IF v_product_count=1 THEN SELECT id INTO v_product_id FROM products WHERE tenant_id=NEW.tenant_id AND active AND (lower(name)=lower(COALESCE(v_line->>'description','')) OR lower(sku)=lower(COALESCE(v_line->>'description',''))) LIMIT 1; END IF;
        END IF;
        IF v_qty > 0 THEN
          v_keys := array_append(v_keys,v_key);
          INSERT INTO crm_quotation_lines(tenant_id,branch_id,quotation_id,quote_record_id,source_line_key,product_id,product_name_snapshot,quantity,unit_price_minor,line_total_minor,line_snapshot)
          VALUES(NEW.tenant_id,NEW.branch_id,(SELECT id FROM crm_quotations WHERE tenant_id=NEW.tenant_id AND branch_id=NEW.branch_id AND record_id=NEW.record_id),NEW.record_id,v_key,v_product_id,COALESCE(v_line->>'description',''),v_qty,v_unit_minor,round(v_qty*v_unit_minor)::bigint,v_line)
          ON CONFLICT(tenant_id,branch_id,quote_record_id,source_line_key) DO UPDATE SET product_id=EXCLUDED.product_id,product_name_snapshot=EXCLUDED.product_name_snapshot,quantity=EXCLUDED.quantity,unit_price_minor=EXCLUDED.unit_price_minor,line_total_minor=EXCLUDED.line_total_minor,line_snapshot=EXCLUDED.line_snapshot;
        END IF;
      END LOOP;
    END IF;
    DELETE FROM crm_quotation_lines q WHERE q.tenant_id=NEW.tenant_id AND q.branch_id=NEW.branch_id AND q.quote_record_id=NEW.record_id AND NOT(q.source_line_key=ANY(v_keys));
  ELSE NULL;
  END CASE;
  RETURN NEW;
END $$;
CREATE TRIGGER module_records_crm_sync AFTER INSERT OR UPDATE OR DELETE ON module_records FOR EACH ROW EXECUTE FUNCTION lexa_sync_crm_module_record();

-- Backfill current records after the trigger is in place, without replacing their history.
UPDATE module_records SET data=data WHERE module_id IN ('customers','suppliers','contacts','leads','opportunities','campaigns','sales-teams','quotations');
UPDATE crm_contacts c SET customer_entity_id=p.id FROM crm_customers p WHERE c.tenant_id=p.tenant_id AND c.branch_id=p.branch_id AND c.party_record_id=p.record_id AND c.party_type='customers';
UPDATE crm_contacts c SET supplier_entity_id=p.id FROM crm_suppliers p WHERE c.tenant_id=p.tenant_id AND c.branch_id=p.branch_id AND c.party_record_id=p.record_id AND c.party_type='suppliers';
UPDATE crm_contacts c SET lead_entity_id=p.id FROM crm_leads p WHERE c.tenant_id=p.tenant_id AND c.branch_id=p.branch_id AND c.party_record_id=p.record_id AND c.party_type='leads';
UPDATE crm_contacts c SET supplier_entity_id=p.id FROM crm_suppliers p WHERE c.tenant_id=p.tenant_id AND c.branch_id=p.branch_id AND c.party_record_id=p.record_id AND c.party_type='suppliers';
UPDATE crm_opportunities o SET customer_entity_id=c.id FROM crm_customers c WHERE o.tenant_id=c.tenant_id AND o.branch_id=c.branch_id AND o.customer_record_id=c.record_id AND o.customer_entity_id IS NULL;
UPDATE crm_opportunities o SET customer_record_id=c.record_id,customer_entity_id=c.id FROM crm_leads l JOIN crm_customers c ON c.tenant_id=l.tenant_id AND c.branch_id=l.branch_id AND c.id=l.converted_customer_id WHERE o.tenant_id=l.tenant_id AND o.branch_id=l.branch_id AND o.lead_record_id=l.record_id AND o.customer_entity_id IS NULL;
UPDATE crm_opportunities o SET campaign_entity_id=c.id FROM crm_campaigns c WHERE o.tenant_id=c.tenant_id AND o.branch_id=c.branch_id AND o.campaign_record_id=c.record_id AND o.campaign_entity_id IS NULL;
UPDATE crm_leads l SET campaign_entity_id=c.id FROM crm_campaigns c WHERE l.tenant_id=c.tenant_id AND l.branch_id=c.branch_id AND l.campaign_record_id=c.record_id AND l.campaign_entity_id IS NULL;

CREATE OR REPLACE FUNCTION lexa_set_crm_customer_reference() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.crm_customer_id IS NULL AND NEW.customer_record_id IS NOT NULL THEN
    SELECT id INTO NEW.crm_customer_id FROM crm_customers WHERE tenant_id=NEW.tenant_id AND branch_id=NEW.branch_id AND record_id=NEW.customer_record_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER commerce_sales_orders_crm_customer BEFORE INSERT OR UPDATE OF customer_record_id ON commerce_sales_orders FOR EACH ROW EXECUTE FUNCTION lexa_set_crm_customer_reference();
CREATE TRIGGER sales_crm_customer BEFORE INSERT OR UPDATE OF customer_record_id ON sales FOR EACH ROW EXECUTE FUNCTION lexa_set_crm_customer_reference();
CREATE TRIGGER ar_customer_invoices_crm_customer BEFORE INSERT OR UPDATE OF customer_record_id ON ar_customer_invoices FOR EACH ROW EXECUTE FUNCTION lexa_set_crm_customer_reference();

CREATE OR REPLACE FUNCTION lexa_set_crm_supplier_reference() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.crm_supplier_id IS NULL AND NEW.supplier_record_id IS NOT NULL THEN
    SELECT id INTO NEW.crm_supplier_id FROM crm_suppliers WHERE tenant_id=NEW.tenant_id AND branch_id=NEW.branch_id AND record_id=NEW.supplier_record_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER commerce_purchase_orders_crm_supplier BEFORE INSERT OR UPDATE OF supplier_record_id ON commerce_purchase_orders FOR EACH ROW EXECUTE FUNCTION lexa_set_crm_supplier_reference();
CREATE TRIGGER ap_supplier_invoices_crm_supplier BEFORE INSERT OR UPDATE OF supplier_record_id ON ap_supplier_invoices FOR EACH ROW EXECUTE FUNCTION lexa_set_crm_supplier_reference();
CREATE TRIGGER ap_supplier_payments_crm_supplier BEFORE INSERT OR UPDATE OF supplier_record_id ON ap_supplier_payments FOR EACH ROW EXECUTE FUNCTION lexa_set_crm_supplier_reference();

-- Backfill stable party IDs into all existing downstream operational rows.
UPDATE commerce_sales_orders o SET crm_customer_id=c.id FROM crm_customers c WHERE o.tenant_id=c.tenant_id AND o.branch_id=c.branch_id AND o.customer_record_id=c.record_id AND o.crm_customer_id IS NULL;
UPDATE sales s SET crm_customer_id=c.id FROM crm_customers c WHERE s.tenant_id=c.tenant_id AND s.branch_id=c.branch_id AND s.customer_record_id=c.record_id AND s.crm_customer_id IS NULL;
UPDATE ar_customer_invoices i SET crm_customer_id=c.id FROM crm_customers c WHERE i.tenant_id=c.tenant_id AND i.branch_id=c.branch_id AND i.customer_record_id=c.record_id AND i.crm_customer_id IS NULL;
UPDATE commerce_purchase_orders o SET crm_supplier_id=s.id FROM crm_suppliers s WHERE o.tenant_id=s.tenant_id AND o.branch_id=s.branch_id AND o.supplier_record_id=s.record_id AND o.crm_supplier_id IS NULL;
UPDATE ap_supplier_invoices i SET crm_supplier_id=s.id FROM crm_suppliers s WHERE i.tenant_id=s.tenant_id AND i.branch_id=s.branch_id AND i.supplier_record_id=s.record_id AND i.crm_supplier_id IS NULL;
UPDATE ap_supplier_payments p SET crm_supplier_id=s.id FROM crm_suppliers s WHERE p.tenant_id=s.tenant_id AND p.branch_id=s.branch_id AND p.supplier_record_id=s.record_id AND p.crm_supplier_id IS NULL;

-- Carry accepted quote-line identity through fulfilment and invoicing.
CREATE UNIQUE INDEX commerce_sales_order_lines_tenant_branch_id_uq
  ON commerce_sales_order_lines(tenant_id, branch_id, id);
ALTER TABLE sale_lines ADD COLUMN branch_id uuid;
UPDATE sale_lines sl SET branch_id = s.branch_id FROM sales s WHERE s.id = sl.sale_id AND sl.branch_id IS NULL;
ALTER TABLE sale_lines ALTER COLUMN branch_id SET NOT NULL;
ALTER TABLE sale_lines ADD COLUMN source_order_line_id uuid;
ALTER TABLE sale_lines ADD CONSTRAINT sale_lines_source_order_line_fk
  FOREIGN KEY (tenant_id, branch_id, source_order_line_id)
  REFERENCES commerce_sales_order_lines(tenant_id, branch_id, id) ON DELETE RESTRICT;
CREATE INDEX sale_lines_source_order_line_idx ON sale_lines(tenant_id, branch_id, source_order_line_id);

CREATE OR REPLACE FUNCTION lexa_set_sale_line_branch() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.branch_id IS NULL THEN
    SELECT branch_id INTO NEW.branch_id FROM sales WHERE tenant_id=NEW.tenant_id AND id=NEW.sale_id;
  END IF;
  IF NEW.branch_id IS NULL THEN RAISE EXCEPTION 'SALE_LINE_BRANCH_REQUIRED: source sale must exist in the same tenant'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER sale_lines_branch_guard BEFORE INSERT OR UPDATE OF sale_id, branch_id ON sale_lines
  FOR EACH ROW EXECUTE FUNCTION lexa_set_sale_line_branch();

ALTER TABLE ar_customer_invoice_lines ADD COLUMN source_quote_line_id uuid;
ALTER TABLE ar_customer_invoice_lines ADD CONSTRAINT ar_invoice_lines_source_quote_line_fk
  FOREIGN KEY (tenant_id, branch_id, source_quote_line_id)
  REFERENCES crm_quotation_lines(tenant_id, branch_id, id) ON DELETE RESTRICT;
CREATE INDEX ar_invoice_lines_source_quote_line_idx ON ar_customer_invoice_lines(tenant_id, branch_id, source_quote_line_id);

-- Preserve tax amounts independently from net selling price on accepted quote lines.
ALTER TABLE commerce_sales_order_lines ADD COLUMN tax_minor integer NOT NULL DEFAULT 0 CHECK (tax_minor >= 0);
ALTER TABLE commerce_sales_order_lines ADD COLUMN unit_cost_minor integer NOT NULL DEFAULT 0 CHECK (unit_cost_minor >= 0);
-- Legacy order lines never stored cost snapshots; initialize once from the current catalogue cost.
UPDATE commerce_sales_order_lines l SET unit_cost_minor=p.cost_price_minor FROM products p WHERE p.id=l.product_id AND l.unit_cost_minor=0;
ALTER TABLE ar_customer_invoice_lines ADD COLUMN tax_minor integer NOT NULL DEFAULT 0 CHECK (tax_minor >= 0);
ALTER TABLE ar_customer_receipts ADD COLUMN customer_record_id text;
ALTER TABLE ar_customer_receipts ADD COLUMN crm_customer_id uuid;
ALTER TABLE ar_customer_receipts ADD CONSTRAINT ar_customer_receipts_crm_customer_fk FOREIGN KEY (tenant_id, branch_id, crm_customer_id) REFERENCES crm_customers(tenant_id, branch_id, id) ON DELETE RESTRICT;
CREATE INDEX ar_customer_receipts_customer_idx ON ar_customer_receipts(tenant_id, branch_id, crm_customer_id, payment_date);
