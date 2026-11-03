# LEXA tenant-owned business setup — 2026-11-03

## Purpose

Implements the approved four-step post-login business configuration **on the existing verified tenant and first branch**:

1. Business identity and location — trading/legal name, business name, country, district, city, first-branch name/address, phone, business email, website, optional registration/TIN.
2. Business activities — industry, multi-select retail/wholesale/distribution/services/manufacturing/etc., physical/digital services/products, customer channels, actual offerings description.
3. Accepted payment **recording** methods — cash, MTN MoMo, Airtel Money, other mobile money, bank transfer, card recorded, cheque, other, plus currency/timezone. **Owner confirmation is mandatory. No gateway is connected, no money is transferred, and the app never asks for PINs/OTPs.**
4. Review and complete — saves business-wide profile and connects to the existing tenant, branch, POS and settings.

The first business is created during verified signup; the wizard updates it, never creates another tenant. Employees without owner rights bypass this setup. Registered owners resume after login. Settings links back to the editable profile.

## Backend contracts

- `GET /api/v1/workspaces/{workspaceId}/business-setup`: member authentication, owner-sensitive field redaction, RLS scope.
- `PATCH /api/v1/workspaces/{workspaceId}/business-setup`: step 1/2/3 transactional owner-only updates, validation, CSRF, audit.
- `POST /api/v1/workspaces/{workspaceId}/business-setup/complete`: owner-only review and completion, validates mandatory fields and owner confirmation.

Schema migration: `20261103190000_business_setup_profile` adds `business_profiles` and `business_payment_methods` with tenant foreign keys, PostgreSQL forced RLS, and runtime-role grants. It makes **no** changes to existing accounts, transactions, finance, or inventory. Both tables are included in the backup inventory.

The legacy `tenants.name`, `tenants.business_type`, `tenants.currency`, and `tenants.timezone` and first-branch fields remain in sync for downstream modules. POS checkout reads the owner-enabled method list, requires confirmation that money was independently received, and the backend rejects disallowed sale/receipt methods once setup is complete. Financial transactions remain auditable and unchanged.

## Safety

- Never fetch profile data from another tenant or from a tenant ID stored only in browser state. Session and membership are rechecked server-side, with transactional RLS.
- Users invited to join an existing business never create a new tenant through the setup wizard.
- Existing business without setup remains usable; conversion is gradual. Currency changes are refused after existing products, sales, accounting journals, or module records.
- Manual payment records do **not** prove an external transfer occurred. The owner must enable the accepted methods and staff confirm receipt through official external evidence before recording a paid sale.
- Legal/tax registration fields collect identifiers but never set tax rates or enable EFRIS automatically.
- Cloudflare, Resend, Neon, Vercel and Render environment credentials are **not** included in this ZIP.

## Tests

- 120 backend tests passed (including 5 new business setup validation/isolation tests).
- OpenAPI exact match: 309 operations across 245 routes.
- 17 backend domain adapters covered.
- Backup inventory: 164 table decisions.
- Repository validator and frontend prebuild transformation scripts passed.
- TypeScript syntax parsing passed for changed TS/TSX files.
- Full npm install, Prisma client generation, frontend typecheck/build, and live browser end-to-end checks require the GitHub CI pipeline (local runner lacks required npm dependency installations).

## Release procedure

Import the ZIP by committing exactly one archive at the root of `MONALISA2003-CMD/The-LEXA-` on `main`. The existing `.github/workflows/repository-import.yml` preserves workflows and performs validation, `npm ci`, Prisma generation/validation, backend tests/build, frontend tests/build, and commits the resulting tree. Render will then deploy the backend, running the migration; Vercel deploys the frontend. **Do not** delete the existing production database or alter provider credentials.

Do not claim the UI is live until GitHub Actions passes and Render/Vercel production deploys are verified. Test using an owner login and a separate employee account, checking owner-only setup and no cross-tenant records.
