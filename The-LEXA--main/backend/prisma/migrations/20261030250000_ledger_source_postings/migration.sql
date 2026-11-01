-- Cost snapshots and default control accounts used by atomic source-to-ledger posting.
ALTER TABLE "sale_lines"
  ADD COLUMN "unit_cost_minor" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "sale_lines"
  ADD CONSTRAINT "sale_lines_unit_cost_nonnegative_check" CHECK ("unit_cost_minor" >= 0);

ALTER TABLE "stock_movements"
  ADD COLUMN "unit_cost_minor" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "stock_movements"
  ADD CONSTRAINT "stock_movements_unit_cost_nonnegative_check" CHECK ("unit_cost_minor" >= 0);

INSERT INTO "ledger_accounts" ("id","tenant_id","account_code","account_name","account_type","normal_balance","system_key")
SELECT gen_random_uuid(), t."id", a.code, a.name, a.kind, a.normal, a.system_key
FROM "tenants" t
CROSS JOIN (VALUES
  ('1030','Other payment clearing','asset','debit','other_clearing'),
  ('1300','Input tax recoverable','asset','debit','input_tax'),
  ('2050','Goods received not invoiced','liability','credit','goods_received_not_invoiced'),
  ('2200','Customer credit balances','liability','credit','customer_credit_liability'),
  ('4050','Sales returns and allowances','revenue','debit','sales_returns'),
  ('5100','Purchase price variance','expense','debit','purchase_price_variance')
) AS a(code,name,kind,normal,system_key)
ON CONFLICT ("tenant_id", "account_code") DO NOTHING;
