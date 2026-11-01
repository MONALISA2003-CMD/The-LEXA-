# Isolated Neon validation record

Project: `empty-mud-76816448` (`lexa-backend`)
Production parent: `br-snowy-hill-ba5a9ggc`

Two child branches were created; the production branch was not modified.

## Clean validation branch

`br-late-feather-ba071esp` (`lexa-ws4-clean-migration-validation`)

| Migration | Result |
|---|---|
| `20261030300000_sale_return_disposition` | Applied successfully (2 SQL statements) |
| `20261030310000_ledger_source_reconciliation` | Applied successfully (4 SQL statements) |
| `20261030320000_platform_catalog_finance_rls` as checked into `main` | Failed: two composite FKs referenced `(tenant_id,id)` without a corresponding unique target |
| `30320000` with `UNIQUE(tenant_id,id)` added to `bank_statement_lines` and `bank_reconciliations` | Applied successfully (107 SQL statements) |
| `20261030330000_crm_first_class_entities_and_quote_acceptance` | Not yet executed on this clean branch |

## Earlier isolated CRM test branch

`br-little-mud-bakcsqhi` (`codex-crm-ledger-workstream4-validation`)

The CRM relational DDL/trigger draft was applied and smoke-tested. Test records demonstrated a lead/customer relationship, quote/customer relationship and stable quote-line identity. Temporary test records were deleted. This was a prototype DDL test, not a successful Prisma migration-deploy of the final `30330000` migration.

The direct SQL validation does not update `_prisma_migrations`. The checked-in migration must be run through `prisma migrate deploy` on an isolated child branch after the final source patch is applied.
