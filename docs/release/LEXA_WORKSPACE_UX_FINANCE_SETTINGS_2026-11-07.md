# LEXA business workspace: navigation, finance and account improvements

**Release source date:** 2026-11-07. **Status:** source candidate, not deployed. This is a forward-only change; it does not change or delete production customer records.

## Design decisions and user evidence

Two mobile recordings and one screenshot showed the product-area control labeled **Working with**, its too-wide selector, and **Manage business activities** link colliding. The component was rendered in the shared application shell and repeated in products, checkout, inventory, procurement and finance screens. Layout-only fixes would perpetuate an irrelevant global filter in finance and account settings. These display components have therefore been removed. The business industry's configured product types and specialized field rules remain in use. All authorized products stay available instead of silently applying an invisible saved filter.

The UX approach follows the principle of orienting users by department, keeping record actions near their lists, avoiding repeated navigation at page tops, and exposing a clear sign-out location. Each module's bright accent is accompanied by a readable label and selected-state marker, rather than color alone. The 11 departments retain their source route and authorization mappings. No module route or financial posting logic is removed.

## Source-level implementation

- `lexa-frontend/src/app/layouts/AppShell.tsx`: removes the global selection card; retains 11 role-filtered navigation groups; one expanded group at a time; module search; per-workspace pinned and recently visited entries; account menu, common Sign out and sidebar exit.
- `lexa-frontend/src/components/business/useBusinessAssortment.ts`: keeps configured industry product metadata and prioritization without hiding actual products. Old visible selector and its CSS are deleted.
- `lexa-frontend/src/domain/shared/moduleAccents.ts` and `src/styles/lexa-spectrum.css`: group accents (blue, violet, fuchsia, orange, green, teal, gold, azure, pink, coral, indigo). Accessible text/action shades use darker colors where necessary, including orange and azure. Light/dark and phone layouts are both covered.
- `lexa-frontend/src/modules/dashboard/DashboardPage.tsx`: concise working dashboard, actual recorded KPIs, real sales history, role-aware actions, no fabricated figures on report failure.
- `lexa-frontend/src/modules/operations/FinanceSectionNav.tsx`, `FinanceOverviewPage.tsx`, `FinanceWorkspacePage.tsx`, `ExpenseApprovalPanel.tsx`, `finance-sapphire.css`: short finance destinations, clearer lists, mobile spacing and forms collapsed until required; existing approve/post/pay endpoints untouched.
- `lexa-frontend/src/modules/settings/AccountAndBusinessSettingsPage.tsx` and accompanying CSS: keeps **Business profile**, **Account security**, **Privacy preferences**, **Business tools**, with department-specific content treatments. One shared sign-out route replaces duplicate profile sign-out.

## Personal login closure (not business deletion)

The user's request called for a strict Delete Account confirmation. Account Security now exposes a separate **Delete my account** panel requiring: matching email, current password, 10–500-character reason, exact phrase `DELETE MY ACCOUNT`, affirmative financial-record retention acknowledgment, and a fresh authenticator or unused recovery code when MFA is enabled.

`POST /api/v1/auth/account/close` is CSRF-protected, server-validated and rate-limited through existing security controls. It is disabled on demo deployments. Closure is refused if the user still has **any** owner or owner-administrator membership, including suspended memberships: owners must transfer all business responsibility first. A successful closure records a timestamp and reason, nulls the password, revokes all sessions, reset links, device trusts and login challenges, writes a security audit event, and expires cookies. A closed login cannot sign in or reset its password; concurrent password reset updates require the account to still be open.

**Data retention disclosure:** This is a *personal login closure*; financial documents, audit trails, transaction authorship, existing memberships and other legally/operationally required records are retained. Closing a business is a different, separately governed operation and is NOT exposed as a casual destructive button. The user's email record is retained and cannot be reused for a new account automatically. Full personal-data erasure requests and statutory retention review must remain a separate administrative/legal process.

**Migration:** `backend/prisma/migrations/20261112100000_personal_account_closure/migration.sql` adds nullable `closed_at` and `closure_reason` fields to `users` and an index. Forward-only, no existing user values changed. Production apply requires usual reviewed `prisma migrate deploy`, separate from ZIP validation.

## Source cleanup

- Removed proven unused `lexa-frontend/public/lexa-icon-256.png` and `lexa-frontend/public/lexa-icon-180.png` (not the separately named Apple touch icon, favicon, webmanifest's 192/512 assets, dynamic `lexa-identity` images, or branding assets).
- Removed only the superseded visible assortment selector component and stylesheet.
- Kept historical Prisma migrations, industry catalogues, sample demo data, public marketing resources and all repository-deployment prerequisites. No sweeping deletion by filename or directory age.
- No `lucide-react` dependency or icon import is added; LEXA's own icon source is retained.

## Checks / release gates

Run from source root before upload:

1. `cd backend && npm test && npm run contract:check && npm run build` using Node 22 with installed dependencies and Prisma client generation.
2. `cd lexa-frontend && npm ci --no-audit --no-fund && npm run build` (includes Vitest and TypeScript). Also run Playwright mobile navigation and settings tests against an isolated environment.
3. `python3 scripts/build_source_import_zip.py /tmp/LEXA.zip --lzma` and `python3 scripts/preflight_import_zip.py /tmp/LEXA.zip`.
4. In staging, apply the migration to a *staging* database and test: owner blocked from deletion, staff closure succeeds with password, MFA and confirmations, sessions immediately revoked, reset tokens invalid, financial records intact, demo deletion blocked, previous legacy-account login intact.
5. Check both major viewport sizes (360 and 1440px), keyboard access, button contrast and all 11 navigation groups. Ensure the backend/frontend builds and database migration pass before deploying production.

No production database modification or live service deployment was performed during preparation of this candidate.
