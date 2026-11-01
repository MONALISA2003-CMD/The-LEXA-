-- Additional control accounts for stock gains and shrinkage.
-- Customer credit balances are created in 20261030250000_ledger_source_postings.
-- Idempotent by tenant/code so pre-seeded environments converge safely.
INSERT INTO "ledger_accounts" ("id", "tenant_id", "account_code", "account_name", "account_type", "normal_balance", "system_key")
SELECT gen_random_uuid(), t."id", a.code, a.name, a.kind, a.normal, a.system_key
FROM "tenants" t
CROSS JOIN (VALUES
  ('4200','Inventory adjustment gains','revenue','credit','inventory_adjustment_gain'),
  ('5200','Inventory shrinkage and write-offs','expense','debit','inventory_shrinkage')
) AS a(code,name,kind,normal,system_key)
ON CONFLICT ("tenant_id", "account_code") DO NOTHING;
