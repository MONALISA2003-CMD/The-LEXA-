# LEXA Control Centre — implementation audit (2026-11-06)

## Scope

Additive admin schema and strict RLS, original business access preserved, new signup payment pending, business renewal view, platform-only admin pages, payment claims, manual approval, UGX 50,000 / 30-day cycles, audit events, revenue trend, scoped user directory, support cases, incident register and evidence-based health. Public pricing is updated on the existing `/lexa` marketing page. Demo deferred.

## Deployment boundary

The source ZIP intentionally excludes `.github`, generated assets, lockfile regeneration artifacts, private `.env` files, credentials, extra hosting and paid worker infrastructure. A ZIP upload is not a production deployment certificate. The new migration MUST be trialled safely and activated via existing guarded Render migration coordinator. No production Neon data was changed while authoring this package.

## Automated local verification

- `node --experimental-strip-types --test backend/test/*.test.mjs`: 409 passing before final archiving (including the new subscription policy tests).
- `python3 -m unittest discover -s backend/analytics -p 'test_*.py'`: 18 passing.
- `node backend/scripts/check-backup-inventory.mjs`: passes after explicitly classifying all 8 new platform-managed tables.
- `node backend/scripts/verify-ledger-posting-coverage.mjs`: passes.
- Python release contract check (`python3 scripts/check_platform_administration_release.py`) verifies required security boundaries, migration table/forced RLS coverage and the lockstep signup paths.

## Not certified in this offline environment

- Full `npm ci`, Prisma client generation, production Nest/Vite bundle and browser Playwright execution require GitHub CI with locked dependencies; offline TypeScript checks are only partial.
- No real administrator logged in; no real customer funds were received; no live payment was confirmed; no screenshot upload or malware scanner is enabled.
- A disposable Neon migration and role/RLS integration test, including authentication under `lexa_app_runtime`, must pass before production release.
- Provider-specific system metrics and background notifications require separately authorized integrations; UI reports them as not connected/disabled rather than fabricating a healthy status.
- A fresh TOTP step-up per sensitive payment approval is not included, although an enrolled authenticator is required for platform console access.

## Non-destructive release criteria

Existing tenants remain `legacy` after migration; only newly verified businesses are pending by default. No DELETE/TRUNCATE on business data; all existing business memberships, inventory, sales and ledgers persist. Review exact expiry timestamp (30 × 24 hours), early renewal (extend current expiry), late renewal (start at approval), idempotence, duplicate references, admin role isolation and paused operational access with preserved data.
