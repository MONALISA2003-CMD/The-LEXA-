-- LEXA Increment 5: append-only General Ledger.
-- Operational sales, receipts, supplier bills, payments and stock movements remain authoritative.
-- Ledger journals are generated transactionally from those source records and are never used as a second transaction store.

-- Snapshot inventory valuation when the operational movement is recorded. Earlier rows are backfilled
-- using the current product cost because the legacy source table did not retain a historical unit cost.
ALTER TABLE stock_movements ADD COLUMN cost_total_minor BIGINT NOT NULL DEFAULT 0;
UPDATE stock_movements sm
   SET cost_total_minor = round(abs(sm.quantity_delta) * p.cost_price_minor)::bigint
  FROM products p
 WHERE p.id = sm.product_id AND p.tenant_id = sm.tenant_id AND sm.cost_total_minor = 0;
ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_cost_total_nonnegative CHECK (cost_total_minor >= 0);

CREATE TABLE gl_accounts (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  account_type TEXT NOT NULL CHECK (account_type IN ('ASSET','LIABILITY','EQUITY','INCOME','COST_OF_SALES','EXPENSE')),
  normal_balance TEXT NOT NULL CHECK (normal_balance IN ('DEBIT','CREDIT')),
  parent_id UUID,
  control_key TEXT CHECK (control_key IS NULL OR control_key IN ('AR','AP','INVENTORY','CASH')),
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  description TEXT,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT gl_accounts_tenant_id_id_key UNIQUE (tenant_id,id),
  CONSTRAINT gl_accounts_tenant_code_key UNIQUE (tenant_id,code),
  CONSTRAINT gl_accounts_parent_fkey FOREIGN KEY (tenant_id,parent_id) REFERENCES gl_accounts(tenant_id,id) ON DELETE RESTRICT,
  CONSTRAINT gl_accounts_type_normal_balance_check CHECK (
    (account_type IN ('ASSET','COST_OF_SALES','EXPENSE') AND normal_balance='DEBIT') OR
    (account_type IN ('LIABILITY','EQUITY','INCOME') AND normal_balance='CREDIT') OR
    (account_type='INCOME' AND normal_balance='DEBIT')
  )
);
CREATE INDEX gl_accounts_tenant_type_idx ON gl_accounts(tenant_id,account_type,is_active,code);
CREATE INDEX gl_accounts_control_idx ON gl_accounts(tenant_id,control_key) WHERE control_key IS NOT NULL;

CREATE TABLE gl_periods (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  closed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  closed_at TIMESTAMPTZ(3),
  reopened_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  reopened_at TIMESTAMPTZ(3),
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT gl_periods_dates_check CHECK (end_date >= start_date),
  CONSTRAINT gl_periods_tenant_name_key UNIQUE (tenant_id,name),
  CONSTRAINT gl_periods_tenant_id_id_key UNIQUE (tenant_id,id)
);
CREATE INDEX gl_periods_range_idx ON gl_periods(tenant_id,start_date,end_date,status);

CREATE TABLE gl_account_mappings (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  mapping_key TEXT NOT NULL,
  account_id UUID NOT NULL,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT gl_account_mappings_tenant_key UNIQUE (tenant_id,mapping_key),
  CONSTRAINT gl_account_mappings_account_fkey FOREIGN KEY (tenant_id,account_id) REFERENCES gl_accounts(tenant_id,id) ON DELETE RESTRICT
);
CREATE INDEX gl_account_mappings_account_idx ON gl_account_mappings(tenant_id,account_id);

CREATE TABLE gl_posting_rules (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT gl_posting_rules_event_key UNIQUE (tenant_id,event_type)
);

CREATE TABLE gl_posting_rule_lines (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  line_number INTEGER NOT NULL,
  mapping_key TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('DEBIT','CREDIT')),
  amount_basis TEXT NOT NULL CHECK (amount_basis IN ('total','subtotal','tax','amount','stock_cost','grni','variance_debit','variance_credit')),
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT gl_posting_rule_lines_rule_fkey FOREIGN KEY (tenant_id,event_type) REFERENCES gl_posting_rules(tenant_id,event_type) ON DELETE CASCADE,
  CONSTRAINT gl_posting_rule_lines_number_key UNIQUE (tenant_id,event_type,line_number)
);

CREATE TABLE gl_journals (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL,
  period_id UUID NOT NULL,
  journal_number TEXT NOT NULL,
  posting_date DATE NOT NULL,
  reference TEXT,
  description TEXT NOT NULL,
  currency TEXT NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  source_type TEXT,
  source_id TEXT,
  event_type TEXT NOT NULL DEFAULT 'manual.journal',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','posted','void')),
  debit_total_minor BIGINT NOT NULL DEFAULT 0 CHECK (debit_total_minor >= 0),
  credit_total_minor BIGINT NOT NULL DEFAULT 0 CHECK (credit_total_minor >= 0),
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  posted_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  posted_at TIMESTAMPTZ(3),
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT gl_journals_tenant_number_key UNIQUE (tenant_id,journal_number),
  CONSTRAINT gl_journals_tenant_id_id_key UNIQUE (tenant_id,id),
  CONSTRAINT gl_journals_branch_fkey FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE RESTRICT,
  CONSTRAINT gl_journals_period_fkey FOREIGN KEY (tenant_id,period_id) REFERENCES gl_periods(tenant_id,id) ON DELETE RESTRICT,
  CONSTRAINT gl_journals_balanced_check CHECK (status <> 'posted' OR (debit_total_minor > 0 AND debit_total_minor = credit_total_minor)),
  CONSTRAINT gl_journals_posted_metadata_check CHECK (status <> 'posted' OR (posted_at IS NOT NULL))
);
CREATE UNIQUE INDEX gl_journals_source_event_key ON gl_journals(tenant_id,source_type,source_id,event_type) WHERE source_type IS NOT NULL AND source_id IS NOT NULL;
CREATE INDEX gl_journals_tenant_branch_date_idx ON gl_journals(tenant_id,branch_id,posting_date DESC,status);
CREATE INDEX gl_journals_tenant_period_idx ON gl_journals(tenant_id,period_id,status);

CREATE TABLE gl_journal_lines (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  journal_id UUID NOT NULL,
  account_id UUID NOT NULL,
  line_number INTEGER NOT NULL,
  description TEXT,
  debit_minor BIGINT NOT NULL DEFAULT 0,
  credit_minor BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT gl_journal_lines_journal_fkey FOREIGN KEY (tenant_id,journal_id) REFERENCES gl_journals(tenant_id,id) ON DELETE RESTRICT,
  CONSTRAINT gl_journal_lines_account_fkey FOREIGN KEY (tenant_id,account_id) REFERENCES gl_accounts(tenant_id,id) ON DELETE RESTRICT,
  CONSTRAINT gl_journal_lines_amount_check CHECK (debit_minor >= 0 AND credit_minor >= 0 AND ((debit_minor > 0 AND credit_minor = 0) OR (credit_minor > 0 AND debit_minor = 0))),
  CONSTRAINT gl_journal_lines_number_key UNIQUE (journal_id,line_number)
);
CREATE INDEX gl_journal_lines_account_idx ON gl_journal_lines(tenant_id,account_id,journal_id);

CREATE TABLE gl_journal_audit (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  journal_id UUID NOT NULL,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT gl_journal_audit_journal_fkey FOREIGN KEY (tenant_id,journal_id) REFERENCES gl_journals(tenant_id,id) ON DELETE RESTRICT
);
CREATE INDEX gl_journal_audit_journal_idx ON gl_journal_audit(tenant_id,journal_id,created_at);

-- Default chart: all control accounts are explicitly mapped; users can extend the chart.
INSERT INTO gl_accounts (id,tenant_id,code,name,account_type,normal_balance,control_key,is_system,description)
SELECT gen_random_uuid(), t.id, x.code, x.name, x.account_type, x.normal_balance, x.control_key, TRUE, x.description
FROM tenants t
CROSS JOIN (VALUES
 ('1000','Cash on hand','ASSET','DEBIT','CASH','Cash till and physical cash'),
 ('1010','Bank account','ASSET','DEBIT','CASH','Bank balances'),
 ('1020','MTN Mobile Money','ASSET','DEBIT','CASH','MTN mobile-money wallet'),
 ('1030','Airtel Money','ASSET','DEBIT','CASH','Airtel mobile-money wallet'),
 ('1100','Accounts receivable control','ASSET','DEBIT','AR','Customer amounts due from completed sales'),
 ('1200','Inventory control','ASSET','DEBIT','INVENTORY','Stock valuation control'),
 ('1300','Input VAT recoverable','ASSET','DEBIT',NULL,'Recoverable input tax on supplier bills'),
 ('1400','Due from branches','ASSET','DEBIT',NULL,'Inter-branch stock transfers awaiting consolidation'),
 ('2000','Accounts payable control','LIABILITY','CREDIT','AP','Approved supplier invoices less supplier payments'),
 ('2100','Goods received not invoiced','LIABILITY','CREDIT',NULL,'Accepted stock receipts accrued pending supplier bills'),
 ('2400','Due to branches','LIABILITY','CREDIT',NULL,'Inter-branch stock transfers awaiting consolidation'),
 ('2200','Output VAT payable','LIABILITY','CREDIT',NULL,'Output tax liability'),
 ('3000','Owner capital','EQUITY','CREDIT',NULL,'Owner contributions and capital'),
 ('3100','Opening balance equity','EQUITY','CREDIT',NULL,'Counter-account for opening stock balances'),
 ('4000','Sales revenue','INCOME','CREDIT',NULL,'Revenue recognised from completed sales'),
 ('4100','Sales returns and allowances','INCOME','DEBIT',NULL,'Contra-revenue for recorded sale refunds'),
 ('4200','Inventory adjustment gains','INCOME','CREDIT',NULL,'Other income from positive stock adjustments'),
 ('5000','Cost of sales','COST_OF_SALES','DEBIT',NULL,'Cost of stock issued with completed sales'),
 ('5100','Purchase price variance','EXPENSE','DEBIT',NULL,'Difference between the inventory receipt cost and supplier invoice cost'),
 ('6000','Inventory adjustment expense','EXPENSE','DEBIT',NULL,'Negative inventory adjustments'),
 ('6010','Inventory write-offs','EXPENSE','DEBIT',NULL,'Stock write-offs and losses')
) AS x(code,name,account_type,normal_balance,control_key,description)
ON CONFLICT (tenant_id,code) DO NOTHING;

INSERT INTO gl_account_mappings (id,tenant_id,mapping_key,account_id)
SELECT gen_random_uuid(),a.tenant_id,m.mapping_key,a.id
FROM gl_accounts a
JOIN (VALUES
 ('cash:cash','1000'),('cash:Cash till','1000'),('cash:default','1000'),('cash:other','1000'),
 ('cash:bank_transfer','1010'),('cash:card_recorded','1010'),('cash:cheque','1010'),('cash:Main bank account','1010'),
 ('cash:mtn_momo','1020'),('cash:MTN Mobile Money','1020'),
 ('cash:airtel_money','1030'),('cash:Airtel Money','1030'),
 ('accounts_receivable','1100'),('inventory','1200'),('input_tax','1300'),
 ('accounts_payable','2000'),('goods_received_not_invoiced','2100'),('owner_capital','3000'),
 ('opening_balance_equity','3100'),('sales_revenue','4000'),('sales_returns','4100'),
 ('inventory_adjustment_gain','4200'),('cost_of_sales','5000'),('purchase_price_variance','5100'),
 ('inventory_adjustment_expense','6000'),('inventory_write_off','6010'),
 ('interbranch_receivable','1400'),('interbranch_payable','2400')
) AS m(mapping_key,code) ON m.code=a.code
ON CONFLICT (tenant_id,mapping_key) DO NOTHING;

-- Keep cash method/ledger account aliases mapped to the same account where appropriate.
INSERT INTO gl_posting_rules (id,tenant_id,event_type,label,description)
SELECT gen_random_uuid(),t.id,r.event_type,r.label,r.description
FROM tenants t
CROSS JOIN (VALUES
 ('sale.completed','Completed sale','Recognise sale value to receivables and revenue.'),
 ('sale.receipt','Sale receipt','Record payment against the receivable from the existing sale-payment record.'),
 ('sale.refund','Sale refund','Record the refund from the existing sale-payment record.'),
 ('ar.receipt','Customer receipt','Record a standalone customer receipt from the AR operational record.'),
 ('ar.refund','Customer refund','Record a standalone customer refund from the AR operational record.'),
 ('ap.invoice.approved','Approved supplier invoice','Reclassify received-goods accrual and input tax to supplier payable.'),
 ('ap.payment','Supplier payment','Record payment against the payable from the AP operational record.'),
 ('stock.receiving','Accepted goods receipt','Recognise accepted stock and goods-received-not-invoiced.'),
 ('stock.transfer_in','Stock transfer received','Recognise stock received from another branch and the inter-branch payable.'),
 ('stock.transfer_out','Stock transfer sent','Recognise stock issued to another branch and the inter-branch receivable.'),
 ('stock.sale','Stock issued for sale','Recognise cost of sales and reduce inventory.'),
 ('stock.return','Stock returned','Restore inventory and reverse the related cost of sales.'),
 ('stock.opening','Opening stock','Recognise opening inventory against opening balance equity.'),
 ('stock.adjustment_in','Positive stock adjustment','Recognise stock increase and inventory adjustment gain.'),
 ('stock.adjustment_out','Negative stock adjustment','Recognise inventory adjustment expense and reduce stock.'),
 ('stock.write_off','Stock write-off','Recognise write-off expense and reduce inventory.')
) AS r(event_type,label,description)
ON CONFLICT (tenant_id,event_type) DO NOTHING;

INSERT INTO gl_posting_rule_lines (id,tenant_id,event_type,line_number,mapping_key,side,amount_basis)
SELECT gen_random_uuid(),t.id,x.event_type,x.line_number,x.mapping_key,x.side,x.amount_basis
FROM tenants t
CROSS JOIN (VALUES
 ('sale.completed',1,'accounts_receivable','DEBIT','total'),('sale.completed',2,'sales_revenue','CREDIT','total'),
 ('sale.receipt',1,'$cash','DEBIT','amount'),('sale.receipt',2,'accounts_receivable','CREDIT','amount'),
 ('sale.refund',1,'sales_returns','DEBIT','amount'),('sale.refund',2,'$cash','CREDIT','amount'),
 ('ar.receipt',1,'$cash','DEBIT','amount'),('ar.receipt',2,'accounts_receivable','CREDIT','amount'),
 ('ar.refund',1,'accounts_receivable','DEBIT','amount'),('ar.refund',2,'$cash','CREDIT','amount'),
 ('ap.invoice.approved',1,'goods_received_not_invoiced','DEBIT','grni'),
 ('ap.invoice.approved',2,'purchase_price_variance','DEBIT','variance_debit'),
 ('ap.invoice.approved',3,'purchase_price_variance','CREDIT','variance_credit'),
 ('ap.invoice.approved',4,'input_tax','DEBIT','tax'),('ap.invoice.approved',5,'accounts_payable','CREDIT','total'),
 ('ap.payment',1,'accounts_payable','DEBIT','amount'),('ap.payment',2,'$cash','CREDIT','amount'),
 ('stock.receiving',1,'inventory','DEBIT','stock_cost'),('stock.receiving',2,'goods_received_not_invoiced','CREDIT','stock_cost'),
 ('stock.transfer_in',1,'inventory','DEBIT','stock_cost'),('stock.transfer_in',2,'interbranch_payable','CREDIT','stock_cost'),
 ('stock.transfer_out',1,'interbranch_receivable','DEBIT','stock_cost'),('stock.transfer_out',2,'inventory','CREDIT','stock_cost'),
 ('stock.sale',1,'cost_of_sales','DEBIT','stock_cost'),('stock.sale',2,'inventory','CREDIT','stock_cost'),
 ('stock.return',1,'inventory','DEBIT','stock_cost'),('stock.return',2,'cost_of_sales','CREDIT','stock_cost'),
 ('stock.opening',1,'inventory','DEBIT','stock_cost'),('stock.opening',2,'opening_balance_equity','CREDIT','stock_cost'),
 ('stock.adjustment_in',1,'inventory','DEBIT','stock_cost'),('stock.adjustment_in',2,'inventory_adjustment_gain','CREDIT','stock_cost'),
 ('stock.adjustment_out',1,'inventory_adjustment_expense','DEBIT','stock_cost'),('stock.adjustment_out',2,'inventory','CREDIT','stock_cost'),
 ('stock.write_off',1,'inventory_write_off','DEBIT','stock_cost'),('stock.write_off',2,'inventory','CREDIT','stock_cost')
) AS x(event_type,line_number,mapping_key,side,amount_basis)
ON CONFLICT (tenant_id,event_type,line_number) DO NOTHING;

-- Monthly periods are initially open so a new workspace can post current and historical source records.
INSERT INTO gl_periods (id,tenant_id,name,start_date,end_date,status)
SELECT gen_random_uuid(),t.id,to_char(d,'YYYY-MM'),d::date,(d + interval '1 month - 1 day')::date,'open'
FROM tenants t CROSS JOIN generate_series('2026-01-01'::date,'2027-12-01'::date,interval '1 month') d
ON CONFLICT (tenant_id,name) DO NOTHING;

CREATE OR REPLACE FUNCTION lexa_gl_post_source(
  p_tenant_id UUID,p_branch_id UUID,p_posting_date DATE,p_event_type TEXT,
  p_source_type TEXT,p_source_id TEXT,p_reference TEXT,p_description TEXT,
  p_currency TEXT,p_payload JSONB,p_actor_id UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_rule gl_posting_rules%ROWTYPE;
  v_period_id UUID;
  v_existing UUID;
  v_journal_id UUID := gen_random_uuid();
  v_journal_number TEXT;
  v_line RECORD;
  v_mapping_key TEXT;
  v_account_id UUID;
  v_amount BIGINT;
  v_line_number INTEGER := 0;
  v_debits BIGINT := 0;
  v_credits BIGINT := 0;
BEGIN
  IF COALESCE((p_payload->>'total')::bigint,COALESCE((p_payload->>'amount')::bigint,COALESCE((p_payload->>'stock_cost')::bigint,0))) = 0
     AND COALESCE((p_payload->>'subtotal')::bigint,0)=0 AND COALESCE((p_payload->>'tax')::bigint,0)=0 THEN
    RETURN NULL;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':'||p_source_type||':'||p_source_id||':'||p_event_type,0));
  SELECT id INTO v_existing FROM gl_journals
   WHERE tenant_id=p_tenant_id AND source_type=p_source_type AND source_id=p_source_id AND event_type=p_event_type;
  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;

  SELECT * INTO v_rule FROM gl_posting_rules WHERE tenant_id=p_tenant_id AND event_type=p_event_type;
  IF NOT FOUND THEN RAISE EXCEPTION 'GL_POSTING_RULE_MISSING: No posting rule is configured for %.',p_event_type USING ERRCODE='P0001'; END IF;
  IF NOT v_rule.enabled THEN RAISE EXCEPTION 'GL_POSTING_RULE_DISABLED: Posting rule % is disabled.',p_event_type USING ERRCODE='P0001'; END IF;

  SELECT id INTO v_period_id FROM gl_periods
   WHERE tenant_id=p_tenant_id AND p_posting_date BETWEEN start_date AND end_date AND status='open'
   ORDER BY start_date DESC LIMIT 1 FOR SHARE;
  IF v_period_id IS NULL THEN RAISE EXCEPTION 'GL_PERIOD_CLOSED: No open accounting period covers %.',p_posting_date USING ERRCODE='P0001'; END IF;

  v_journal_number := 'GL-'||to_char(p_posting_date,'YYYYMMDD')||'-'||upper(substr(replace(v_journal_id::text,'-',''),1,8));
  INSERT INTO gl_journals(id,tenant_id,branch_id,period_id,journal_number,posting_date,reference,description,currency,source_type,source_id,event_type,status,created_by_user_id)
  VALUES(v_journal_id,p_tenant_id,p_branch_id,v_period_id,v_journal_number,p_posting_date,p_reference,p_description,p_currency,p_source_type,p_source_id,p_event_type,'draft',p_actor_id);

  FOR v_line IN SELECT * FROM gl_posting_rule_lines WHERE tenant_id=p_tenant_id AND event_type=p_event_type ORDER BY line_number LOOP
    v_mapping_key := CASE WHEN v_line.mapping_key='$cash' THEN COALESCE(NULLIF(p_payload->>'cash_key',''),'cash:default') ELSE v_line.mapping_key END;
    v_amount := COALESCE(NULLIF(p_payload->>v_line.amount_basis,'')::bigint,0);
    IF v_amount < 0 THEN RAISE EXCEPTION 'GL_INVALID_SOURCE_AMOUNT: Negative posting amount for %.',v_line.amount_basis USING ERRCODE='P0001'; END IF;
    IF v_amount=0 THEN CONTINUE; END IF;
    SELECT m.account_id INTO v_account_id
      FROM gl_account_mappings m JOIN gl_accounts a ON a.tenant_id=m.tenant_id AND a.id=m.account_id
     WHERE m.tenant_id=p_tenant_id AND m.mapping_key=v_mapping_key AND a.is_active;
    IF v_account_id IS NULL THEN RAISE EXCEPTION 'GL_ACCOUNT_MAPPING_MISSING: Map % to an active chart-of-accounts entry.',v_mapping_key USING ERRCODE='P0001'; END IF;
    v_line_number := v_line_number+1;
    INSERT INTO gl_journal_lines(id,tenant_id,journal_id,account_id,line_number,description,debit_minor,credit_minor)
    VALUES(gen_random_uuid(),p_tenant_id,v_journal_id,v_account_id,v_line_number,p_description,
      CASE WHEN v_line.side='DEBIT' THEN v_amount ELSE 0 END,
      CASE WHEN v_line.side='CREDIT' THEN v_amount ELSE 0 END);
    IF v_line.side='DEBIT' THEN v_debits:=v_debits+v_amount; ELSE v_credits:=v_credits+v_amount; END IF;
  END LOOP;
  IF v_line_number<2 OR v_debits=0 OR v_debits<>v_credits THEN
    RAISE EXCEPTION 'GL_UNBALANCED_POSTING: % debits and % credits for %.',v_debits,v_credits,p_event_type USING ERRCODE='P0001';
  END IF;
  UPDATE gl_journals SET status='posted',debit_total_minor=v_debits,credit_total_minor=v_credits,posted_by_user_id=p_actor_id,posted_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=v_journal_id;
  INSERT INTO gl_journal_audit(id,tenant_id,journal_id,actor_user_id,action,details)
  VALUES(gen_random_uuid(),p_tenant_id,v_journal_id,p_actor_id,'posted_from_source',jsonb_build_object('sourceType',p_source_type,'sourceId',p_source_id,'eventType',p_event_type,'reference',p_reference,'debitMinor',v_debits,'creditMinor',v_credits));
  RETURN v_journal_id;
END;
$$ LANGUAGE plpgsql;

-- Every newly-created stock movement carries a cost snapshot. This avoids future product-price edits
-- changing historic inventory and COGS values. The value is computed from the operational product record.
CREATE OR REPLACE FUNCTION lexa_gl_snapshot_stock_cost() RETURNS trigger AS $$
DECLARE v_unit_cost BIGINT;
BEGIN
  SELECT cost_price_minor INTO v_unit_cost FROM products WHERE id=NEW.product_id AND tenant_id=NEW.tenant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'GL_STOCK_PRODUCT_MISSING: Cannot value stock movement for an unknown product.' USING ERRCODE='P0001'; END IF;
  NEW.cost_total_minor := round(abs(NEW.quantity_delta) * v_unit_cost)::bigint;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER stock_movements_cost_snapshot BEFORE INSERT ON stock_movements FOR EACH ROW EXECUTE FUNCTION lexa_gl_snapshot_stock_cost();

-- Source record triggers post in the same DB transaction; failures roll back the source write.
CREATE OR REPLACE FUNCTION lexa_gl_sales_trigger() RETURNS trigger AS $$
DECLARE v_currency TEXT; v_timezone TEXT;
BEGIN
  IF NEW.status='completed' AND NEW.total_minor>0 THEN
    IF TG_OP='UPDATE' AND OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;
    SELECT currency,timezone INTO v_currency,v_timezone FROM branches WHERE id=NEW.branch_id AND tenant_id=NEW.tenant_id;
    PERFORM lexa_gl_post_source(NEW.tenant_id,NEW.branch_id,(NEW.created_at AT TIME ZONE COALESCE(v_timezone,'Africa/Kampala'))::date,'sale.completed','sale',NEW.id::text,NEW.receipt_number,'Completed sale '||NEW.receipt_number,v_currency,jsonb_build_object('total',NEW.total_minor),NULL);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER sales_post_general_ledger AFTER INSERT OR UPDATE OF status ON sales FOR EACH ROW EXECUTE FUNCTION lexa_gl_sales_trigger();

CREATE OR REPLACE FUNCTION lexa_gl_sale_payment_trigger() RETURNS trigger AS $$
DECLARE v_sale RECORD; v_event TEXT;
BEGIN
  SELECT s.id,s.tenant_id,s.branch_id,s.receipt_number,s.status,b.currency,b.timezone INTO v_sale
    FROM sales s JOIN branches b ON b.id=s.branch_id AND b.tenant_id=s.tenant_id WHERE s.id=NEW.sale_id AND s.tenant_id=NEW.tenant_id;
  IF NOT FOUND THEN RETURN NEW; END IF;
  IF v_sale.status<>'completed' THEN RETURN NEW; END IF;
  v_event := CASE WHEN NEW.kind='refund' THEN 'sale.refund' ELSE 'sale.receipt' END;
  PERFORM lexa_gl_post_source(NEW.tenant_id,v_sale.branch_id,(NEW.created_at AT TIME ZONE COALESCE(v_sale.timezone,'Africa/Kampala'))::date,v_event,'sale_payment',NEW.id::text,
    COALESCE(NEW.reference,v_sale.receipt_number),'Sale '||NEW.kind||' '||v_sale.receipt_number,v_sale.currency,
    jsonb_build_object('amount',NEW.amount_minor,'cash_key','cash:'||NEW.method),NULL);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER sale_payments_post_general_ledger AFTER INSERT ON sale_payments FOR EACH ROW EXECUTE FUNCTION lexa_gl_sale_payment_trigger();

CREATE OR REPLACE FUNCTION lexa_gl_ar_receipt_trigger() RETURNS trigger AS $$
DECLARE v_event TEXT; v_currency TEXT;
BEGIN
  -- The existing AR trigger mirrors POS sale_payments here; the sale_payment trigger is the sole GL source for those.
  IF NEW.source_sale_payment_id IS NOT NULL THEN RETURN NEW; END IF;
  SELECT currency INTO v_currency FROM branches WHERE id=NEW.branch_id AND tenant_id=NEW.tenant_id;
  v_event := CASE WHEN NEW.kind='refund' THEN 'ar.refund' ELSE 'ar.receipt' END;
  PERFORM lexa_gl_post_source(NEW.tenant_id,NEW.branch_id,NEW.payment_date,v_event,'ar_customer_receipt',NEW.id::text,
    COALESCE(NEW.reference,NEW.receipt_number),'Customer '||NEW.kind||' '||NEW.receipt_number,v_currency,
    jsonb_build_object('amount',NEW.amount_minor,'cash_key','cash:'||NEW.method),NEW.created_by_user_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER ar_customer_receipts_post_general_ledger AFTER INSERT ON ar_customer_receipts FOR EACH ROW EXECUTE FUNCTION lexa_gl_ar_receipt_trigger();

CREATE OR REPLACE FUNCTION lexa_gl_ap_invoice_trigger() RETURNS trigger AS $$
DECLARE v_grni BIGINT; v_variance BIGINT;
BEGIN
  IF NEW.status='approved' THEN
    IF TG_OP='UPDATE' AND OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;
    -- Value the invoiced accepted quantity using the cost snapshot stored on the original receiving movement.
    -- Any difference from the supplier's invoice subtotal is recognised in purchase price variance.
    SELECT COALESCE(sum(round(ail.quantity * receipt_cost.unit_cost_minor)),0)::bigint INTO v_grni
    FROM ap_supplier_invoice_lines ail
    JOIN commerce_goods_receipt_lines grl ON grl.id=ail.receipt_line_id AND grl.tenant_id=ail.tenant_id
    JOIN LATERAL (
      SELECT sum(sm.cost_total_minor)::numeric / NULLIF(sum(abs(sm.quantity_delta)),0) AS unit_cost_minor
      FROM stock_movements sm
      WHERE sm.tenant_id=NEW.tenant_id AND sm.branch_id=NEW.branch_id
        AND sm.source_id=grl.receipt_id::text AND sm.product_id=ail.product_id AND sm.type='receiving'
    ) receipt_cost ON receipt_cost.unit_cost_minor IS NOT NULL
    WHERE ail.tenant_id=NEW.tenant_id AND ail.invoice_id=NEW.id;
    v_variance := NEW.subtotal_minor - COALESCE(v_grni,0);
    PERFORM lexa_gl_post_source(NEW.tenant_id,NEW.branch_id,NEW.bill_date,'ap.invoice.approved','ap_supplier_invoice',NEW.id::text,
      NEW.supplier_invoice_number,'Approved supplier invoice '||NEW.invoice_number,NEW.currency,
      jsonb_build_object('grni',COALESCE(v_grni,0),'variance_debit',greatest(v_variance,0),'variance_credit',greatest(-v_variance,0),
        'subtotal',NEW.subtotal_minor,'tax',NEW.tax_minor,'total',NEW.total_minor),NEW.approved_by_user_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER ap_supplier_invoices_post_general_ledger AFTER INSERT OR UPDATE OF status ON ap_supplier_invoices FOR EACH ROW EXECUTE FUNCTION lexa_gl_ap_invoice_trigger();

CREATE OR REPLACE FUNCTION lexa_gl_ap_payment_trigger() RETURNS trigger AS $$
BEGIN
  PERFORM lexa_gl_post_source(NEW.tenant_id,NEW.branch_id,NEW.payment_date,'ap.payment','ap_supplier_payment',NEW.id::text,
    COALESCE(NEW.reference,NEW.payment_number),'Supplier payment '||NEW.payment_number,NEW.currency,
    jsonb_build_object('amount',NEW.amount_minor,'cash_key','cash:'||NEW.account),NEW.created_by_user_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER ap_supplier_payments_post_general_ledger AFTER INSERT ON ap_supplier_payments FOR EACH ROW EXECUTE FUNCTION lexa_gl_ap_payment_trigger();

CREATE OR REPLACE FUNCTION lexa_gl_stock_movement_trigger() RETURNS trigger AS $$
DECLARE v_cost BIGINT; v_event TEXT; v_product RECORD;
BEGIN
  SELECT p.name,b.currency,b.timezone INTO v_product FROM products p JOIN branches b ON b.id=NEW.branch_id AND b.tenant_id=NEW.tenant_id
   WHERE p.id=NEW.product_id AND p.tenant_id=NEW.tenant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'GL_STOCK_PRODUCT_MISSING: Cannot post stock movement without its product and branch.' USING ERRCODE='P0001'; END IF;
  v_cost := NEW.cost_total_minor;
  IF COALESCE(v_cost,0)<=0 THEN RETURN NEW; END IF;
  v_event := CASE NEW.type
    WHEN 'receiving' THEN 'stock.receiving'
    WHEN 'transfer_in' THEN 'stock.transfer_in'
    WHEN 'transfer_out' THEN 'stock.transfer_out'
    WHEN 'sale' THEN 'stock.sale'
    WHEN 'return' THEN 'stock.return'
    WHEN 'opening' THEN 'stock.opening'
    WHEN 'write_off' THEN 'stock.write_off'
    WHEN 'adjustment' THEN CASE WHEN NEW.quantity_delta>0 THEN 'stock.adjustment_in' ELSE 'stock.adjustment_out' END
    ELSE NULL END;
  IF v_event IS NULL THEN RETURN NEW; END IF;
  PERFORM lexa_gl_post_source(NEW.tenant_id,NEW.branch_id,(NEW.created_at AT TIME ZONE COALESCE(v_product.timezone,'Africa/Kampala'))::date,v_event,'stock_movement',NEW.id::text,
    NEW.source_id, 'Stock '||NEW.type||' — '||v_product.name||' — '||NEW.reason,v_product.currency,
    jsonb_build_object('stock_cost',v_cost),NULL);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER stock_movements_post_general_ledger AFTER INSERT ON stock_movements FOR EACH ROW EXECUTE FUNCTION lexa_gl_stock_movement_trigger();

-- Posted journal headers and lines are immutable. Corrections must be posted as reversing journals.
CREATE OR REPLACE FUNCTION lexa_gl_guard_posted_journal() RETURNS trigger AS $$
BEGIN
  IF OLD.status IN ('posted','void') THEN RAISE EXCEPTION 'GL_POSTED_JOURNAL_IMMUTABLE: Posted journals cannot be changed or deleted; post a reversal.' USING ERRCODE='P0001'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER gl_journals_immutable BEFORE UPDATE OR DELETE ON gl_journals FOR EACH ROW EXECUTE FUNCTION lexa_gl_guard_posted_journal();

CREATE OR REPLACE FUNCTION lexa_gl_guard_posted_lines() RETURNS trigger AS $$
DECLARE v_status TEXT; v_journal UUID;
BEGIN
  IF TG_OP='DELETE' OR TG_OP='UPDATE' THEN
    SELECT status INTO v_status FROM gl_journals WHERE id=OLD.journal_id;
    IF v_status IN ('posted','void') THEN RAISE EXCEPTION 'GL_POSTED_LINES_IMMUTABLE: Posted or voided journal lines cannot be changed or deleted.' USING ERRCODE='P0001'; END IF;
  END IF;
  IF TG_OP='INSERT' OR TG_OP='UPDATE' THEN
    SELECT status INTO v_status FROM gl_journals WHERE id=NEW.journal_id;
    IF v_status IN ('posted','void') THEN RAISE EXCEPTION 'GL_POSTED_LINES_IMMUTABLE: Lines cannot be added to a posted or voided journal.' USING ERRCODE='P0001'; END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER gl_journal_lines_immutable BEFORE INSERT OR UPDATE OR DELETE ON gl_journal_lines FOR EACH ROW EXECUTE FUNCTION lexa_gl_guard_posted_lines();

CREATE OR REPLACE FUNCTION lexa_gl_audit_immutable() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'GL_AUDIT_IMMUTABLE: General-ledger audit history is append-only.' USING ERRCODE='P0001'; END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER gl_journal_audit_immutable BEFORE UPDATE OR DELETE ON gl_journal_audit FOR EACH ROW EXECUTE FUNCTION lexa_gl_audit_immutable();

-- Prevent a posted period from being re-opened/closed by untracked SQL update; API writes always create audit_events.
CREATE OR REPLACE FUNCTION lexa_gl_period_update_guard() RETURNS trigger AS $$
BEGIN
  IF OLD.status='closed' AND NEW.status='open' AND current_setting('lexa.gl_period_reopen',true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'GL_PERIOD_REOPEN_REQUIRES_WORKFLOW: Reopen periods through the accounting API.' USING ERRCODE='P0001';
  END IF;
  IF OLD.status='open' AND NEW.status='closed' AND current_setting('lexa.gl_period_close',true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'GL_PERIOD_CLOSE_REQUIRES_WORKFLOW: Close periods through the accounting API.' USING ERRCODE='P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER gl_periods_workflow_guard BEFORE UPDATE OF status ON gl_periods FOR EACH ROW EXECUTE FUNCTION lexa_gl_period_update_guard();

-- Register the dedicated accounting destination in the module directory without creating records in module_records.
INSERT INTO module_definitions(module_id,title,singular_label,group_name,schema_version,storage_kind,is_writable,sort_order)
VALUES('accounting','General Ledger','journal entry','FINANCE',1,'typed_general_ledger',false,900)
ON CONFLICT (module_id) DO UPDATE SET title='General Ledger',singular_label='journal entry',group_name='FINANCE',storage_kind='typed_general_ledger',is_writable=false,updated_at=CURRENT_TIMESTAMP;


-- Idempotent migration backfill: existing operational records are projected once into the ledger.
-- Source rows are not changed, copied or deleted. The unique source/event key prevents duplicates.
DO $$
DECLARE r RECORD; v_currency TEXT; v_cost BIGINT; v_event TEXT; v_grni BIGINT; v_variance BIGINT;
BEGIN
  FOR r IN SELECT s.*,b.currency,b.timezone FROM sales s JOIN branches b ON b.id=s.branch_id AND b.tenant_id=s.tenant_id WHERE s.status='completed' AND s.total_minor>0 LOOP
    PERFORM lexa_gl_post_source(r.tenant_id,r.branch_id,(r.created_at AT TIME ZONE COALESCE(r.timezone,'Africa/Kampala'))::date,'sale.completed','sale',r.id::text,r.receipt_number,'Completed sale '||r.receipt_number,r.currency,jsonb_build_object('total',r.total_minor),NULL);
  END LOOP;
  FOR r IN SELECT p.*,s.branch_id,s.receipt_number,s.status,b.currency,b.timezone FROM sale_payments p JOIN sales s ON s.id=p.sale_id AND s.tenant_id=p.tenant_id JOIN branches b ON b.id=s.branch_id AND b.tenant_id=s.tenant_id WHERE s.status='completed' LOOP
    PERFORM lexa_gl_post_source(r.tenant_id,r.branch_id,(r.created_at AT TIME ZONE COALESCE(r.timezone,'Africa/Kampala'))::date,CASE WHEN r.kind='refund' THEN 'sale.refund' ELSE 'sale.receipt' END,
      'sale_payment',r.id::text,COALESCE(r.reference,r.receipt_number),'Sale '||r.kind||' '||r.receipt_number,r.currency,
      jsonb_build_object('amount',r.amount_minor,'cash_key','cash:'||r.method),NULL);
  END LOOP;
  FOR r IN SELECT * FROM ar_customer_receipts WHERE source_sale_payment_id IS NULL LOOP
    SELECT currency INTO v_currency FROM branches WHERE id=r.branch_id AND tenant_id=r.tenant_id;
    PERFORM lexa_gl_post_source(r.tenant_id,r.branch_id,r.payment_date,CASE WHEN r.kind='refund' THEN 'ar.refund' ELSE 'ar.receipt' END,
      'ar_customer_receipt',r.id::text,COALESCE(r.reference,r.receipt_number),'Customer '||r.kind||' '||r.receipt_number,v_currency,
      jsonb_build_object('amount',r.amount_minor,'cash_key','cash:'||r.method),r.created_by_user_id);
  END LOOP;
  FOR r IN SELECT * FROM ap_supplier_invoices WHERE status IN ('approved','partially_paid','paid') LOOP
    SELECT COALESCE(sum(round(ail.quantity * receipt_cost.unit_cost_minor)),0)::bigint INTO v_grni
    FROM ap_supplier_invoice_lines ail
    JOIN commerce_goods_receipt_lines grl ON grl.id=ail.receipt_line_id AND grl.tenant_id=ail.tenant_id
    JOIN LATERAL (
      SELECT sum(sm.cost_total_minor)::numeric / NULLIF(sum(abs(sm.quantity_delta)),0) AS unit_cost_minor
      FROM stock_movements sm
      WHERE sm.tenant_id=r.tenant_id AND sm.branch_id=r.branch_id
        AND sm.source_id=grl.receipt_id::text AND sm.product_id=ail.product_id AND sm.type='receiving'
    ) receipt_cost ON receipt_cost.unit_cost_minor IS NOT NULL
    WHERE ail.tenant_id=r.tenant_id AND ail.invoice_id=r.id;
    v_variance := r.subtotal_minor - COALESCE(v_grni,0);
    PERFORM lexa_gl_post_source(r.tenant_id,r.branch_id,r.bill_date,'ap.invoice.approved','ap_supplier_invoice',r.id::text,
      r.supplier_invoice_number,'Approved supplier invoice '||r.invoice_number,r.currency,
      jsonb_build_object('grni',COALESCE(v_grni,0),'variance_debit',greatest(v_variance,0),'variance_credit',greatest(-v_variance,0),
        'subtotal',r.subtotal_minor,'tax',r.tax_minor,'total',r.total_minor),r.approved_by_user_id);
  END LOOP;
  FOR r IN SELECT * FROM ap_supplier_payments LOOP
    PERFORM lexa_gl_post_source(r.tenant_id,r.branch_id,r.payment_date,'ap.payment','ap_supplier_payment',r.id::text,
      COALESCE(r.reference,r.payment_number),'Supplier payment '||r.payment_number,r.currency,
      jsonb_build_object('amount',r.amount_minor,'cash_key','cash:'||r.account),r.created_by_user_id);
  END LOOP;
  FOR r IN SELECT sm.*,p.name,b.currency,b.timezone FROM stock_movements sm JOIN products p ON p.id=sm.product_id AND p.tenant_id=sm.tenant_id JOIN branches b ON b.id=sm.branch_id AND b.tenant_id=sm.tenant_id WHERE sm.cost_total_minor>0 LOOP
    v_cost := r.cost_total_minor;
    IF v_cost<=0 THEN CONTINUE; END IF;
    v_event := CASE r.type
      WHEN 'receiving' THEN 'stock.receiving' WHEN 'transfer_in' THEN 'stock.transfer_in' WHEN 'transfer_out' THEN 'stock.transfer_out'
      WHEN 'sale' THEN 'stock.sale' WHEN 'return' THEN 'stock.return'
      WHEN 'opening' THEN 'stock.opening' WHEN 'write_off' THEN 'stock.write_off'
      WHEN 'adjustment' THEN CASE WHEN r.quantity_delta>0 THEN 'stock.adjustment_in' ELSE 'stock.adjustment_out' END ELSE NULL END;
    IF v_event IS NOT NULL THEN
      PERFORM lexa_gl_post_source(r.tenant_id,r.branch_id,(r.created_at AT TIME ZONE COALESCE(r.timezone,'Africa/Kampala'))::date,v_event,'stock_movement',r.id::text,r.source_id,
        'Stock '||r.type||' — '||r.name||' — '||r.reason,r.currency,jsonb_build_object('stock_cost',v_cost),NULL);
    END IF;
  END LOOP;
END;
$$;
