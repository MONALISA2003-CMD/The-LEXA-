# Business-adaptive workspace: implementation and verification

**Date:** 2026-11-05  
**Source specifications:** `docs/specifications/lexa-multi-business-industry-adaptive-erp.md` and `docs/specifications/lexa-electronics-catalogue-v2.md`  
**Release status:** Source implementation ready for CI; not yet a certified production deployment.

## Implemented

- The owner's multi-industry and multi-specialty selections remain the authoritative persisted business configuration in Business Setup. No arbitrary limit below the published catalogue size; multiple selected activities share the existing tenant, product identifiers and accounting ledger.
- Business Setup now includes a searchable multi-select list and shows the number of selections. Saving business activities invalidates the cached industry policy and setup queries so other open modules refresh.
- Settings no longer offers a second single-choice “Business type” field that could contradict the owner-selected activities. It shows the saved activities and specialties and offers a single entry point for revisions.
- `businessAssortmentRules.ts` implements the default **union of the owner's selected specialties**, explicit focus on one specialty, and an explicit historical/all-existing-product view. Unselected specialties cannot be activated from a client-side preference. This filter controls only presentation, not backend permissions or financial posting.
- Products: default list, inventory KPIs, existing categories and creation templates adapt to the selected specialties. Broader allowed categories remain accessible explicitly for legitimate new products and historical edits; specialty filtering never deletes data.
- Purchasing: new purchase requests use the selected catalogue choices by default; previously chosen purchase lines remain editable even if their category is outside the current presentation focus.
- Inventory: balances, low-stock alerts, product drill-down, adjustments and movement views focus on the selected assortment; source ledger records remain unchanged. Electronics service and production workspaces appear when relevant, or through existing deep links as appropriate.
- Checkout: available-products grid respects the same selection while the exact barcode/IMEI scan, current cart, and historical sales/returns continue to use authorized canonical product identities. Empty-category messaging explains the all-existing-product option.
- Warehouse demand: the displayed recommendations follow the selected assortment; the backend's calculations remain unchanged and advisory.
- The shared application shell exposes the business-focus selector throughout other workspaces and prioritizes relevant navigation sections. The backend publishes recommended navigation sections with the versioned industry policy. All roles retain the existing role/permission checks, and non-featured permitted modules remain accessible from Browse additional modules and global search.
- The overview explicitly identifies its financial and company-level figures as consolidated. No unverified division margin or fabricated split of historic accounting transactions is introduced.

## Invariants preserved

1. Business activity selection never assigns stock, manufacturers, barcodes, serials, payments or tax compliance automatically.
2. Product authorization remains enforced by the NestJS backend's existing `assertTypeAllowed` and catalog stock policies. A presentation preference cannot bypass user/tenant/branch permissions.
3. Historical products, posted transactions, warranty cases and refunds remain reachable through explicit authorized navigation and search.
4. The source ZIP does not replace `.github` workflows or the committed npm lockfiles that the importer preserves. No production database migration or feature flag is needed by this user-interface update.
5. Commercial ledger values and stock postings remain authoritative; company-wide financial data is never silently filtered by a client preference.

## Verification

- Backend and cross-client regression tests: 387 passed (recorded during development), plus 18 Python analytics tests.
- Contract: 484 OpenAPI operations across 390 routes; generated catalogue and specialty contract checks passed.
- Fastify uniqueness: 507 routes; backup inventory and journal coverage checks passed.
- Complete TypeScript/TSX source parsing: 324 files, no syntax errors, including after running the existing Vercel frontend prebuild source checks.
- Standalone TypeScript typecheck: `backend/src/catalog/business-presentation.ts` and `lexa-frontend/src/domain/catalog/businessAssortmentRules.ts` passed strict mode.
- Full dependency-backed Nest/Prisma, Vitest and Vite production builds were not executed in this environment because the npm dependency tree is not available; run the repository-import GitHub workflow and authenticated staging tests before enabling a new production release.

## Release acceptance checklist

- [ ] GitHub source import: layout, committed lockfile restoration, backend `npm ci`, Prisma generate/validate, tests, contract checks and Nest build pass.
- [ ] Frontend `npm ci`, Vitest suite, TypeScript project build and Vite production build pass.
- [ ] Sign in as boutique-only owner: clothing appears; phone catalogue and technical panels are not promoted; global historical search remains accessible.
- [ ] Sign in as fragrance-only owner: perfume and oils appear, with correct batch/decant processes; unrelated phone items are not promoted.
- [ ] Sign in as boutique + fragrance owner: both are available together by default and can be focused individually without changing the product/stock identities.
- [ ] Add a third business activity; verify all open pages refresh immediately and existing records are retained.
- [ ] Remove an activity after the required impact acknowledgement; verify no historical sale, return, purchase, inventory ledger or GL entries disappear.
- [ ] Confirm cashier/manager/owner roles and two-tenant isolation, exact barcode lookup, branch inventory and all-existing-product search.
- [ ] Confirm Render LIVE and Vercel READY at the **new** imported source SHA, with healthy API and browser smoke checks.

**Scope note:** This release implements business-selected workspace personalization from the design discussion; it is not a certification of every remaining transactional and external-integration requirement from both full SRS documents. The existing separate SRS release gates remain mandatory.
