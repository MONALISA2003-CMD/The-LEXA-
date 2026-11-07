# LEXA midnight navigation / responsive UX release

Date: 7 November 2026. Scope: frontend navigation, user-facing terminology, source-generator safeguards and UI regression tests. No database migration, API route or tenant record is changed by this release.

## What changed

- One consistent midnight-blue (`#0B1F3A`) sidebar in both themes, with an accessible, high-contrast active-link blue (`#1D4ED8`). All business-area colors remain in the page body, cards, headings, charts and finance workflows via the existing `data-module-accent` system.
- Business area groups have simpler customer-facing names: Your business, Reports & insights, Customers & growth, Sales, Inventory, Deliveries, Purchasing, Finance, Team & payroll, Production & quality, Projects & service. The underlying stable group keys and all 65 route definitions remain unchanged.
- Navigation search is labelled **Find a page**, searches both business area display names and the underlying group names, and provides a useful empty result. Quick Access shows Overview, Checkout and Products only when the user's access permits them. Pinned and recent pages are now accessible through a collapsed **Favourites & recent pages** disclosure.
- The sidebar footer keeps Help centre, Account & business settings and Sign out visible. The redundant sidebar storage panel has been removed from navigation only; business storage and data behavior are unchanged.
- Common visible terms in the business directory, demo and related-record UI now say business area or business page instead of generic software module wording. Backend paths `/modules/...` and database fields such as `enabledModules` stay unchanged for backward compatibility.
- Mobile navigation is a labelled dialog with Escape-to-close, keyboard focus containment and restoration, scroll locking, `inert` content behind the drawer and improved route-change focus. Its business-area list scrolls independently of the footer. The CSS includes 320px and 860px breakpoints, dynamic viewport height, iOS safe-area padding and reduced-motion handling.
- `lexa-frontend/src/styles/lexa-sidebar-unified.css` is imported after the departmental palette. Existing legacy sidebar styles are superseded without removing underlying business colors.
- `apply_lexa_palette.py` now accepts and preserves the deliberate one-color navigation without weakening route-color verification. The generator remains idempotent, tested twice in an isolated copy.
- Frontend E2E tests match the renamed search and the mobile `role=dialog`; new responsive scenarios cover 320px phone, 820px tablet and 1280px desktop. An opt-in `LEXA_CROSS_BROWSER=1` Playwright configuration enables Chromium, Firefox and WebKit once those browser engines are installed.

## Verification performed in this source session

- Backend: 472 Node tests and 18 Python tests passed with a temporary local link to the already-installed TypeScript compiler; the link was removed and is not in this ZIP.
- API: 497 OpenAPI operations across 402 routes, 19 route adapters; 563 Fastify registrations across 36 controllers.
- Database safety: 57 migration SQL structures passed, and backup decisions covered 227 tables.
- Frontend prebuild: palette validator passed 11 group colors and all 65 sidebar destinations. Python regression tests for sidebar semantics, palette generator, and two-run navigation generator preservation passed. Frontend TS/TSX syntax parsing passed; no `lucide-react` imports were introduced.
- Real browser layout check: Chromium with actual shipped CSS at 320×640, 390×844, 820×1180 and 1440×900, in both light and dark themes. Consistent sidebar and active colors; no horizontal overflow; footer remained visible; the navigation list scrolls on short screens.
- A full dependency-installed frontend typecheck / Vitest run and the real-app Playwright E2E suite have **not** been executed in this isolated container. GitHub Actions and Vercel must confirm them. Firefox and WebKit have not been executed here; the cross-browser suite is prepared, not certified.

## How to release

1. Upload the root-level ZIP to GitHub **without extracting**. The workflow preserves `.github` and restores verified npm lockfiles.
2. Require the repository ZIP import workflow to pass backend and frontend checks, followed by `LEXA isolated browser workflow tests`.
3. Require Vercel production to report **READY**. Check navigation in Chrome on desktop, Chrome on Android, Safari on iOS and Firefox on desktop before a broad customer release.
4. In a dependency-installed checkout with Playwright browsers: `cd lexa-frontend && npx playwright install chromium firefox webkit && LEXA_CROSS_BROWSER=1 npm run test:e2e`.
5. No Neon or Render migration is required for these navigation and copy changes; do not reset customer data or modify demo isolation.

## Compatibility boundaries

The one-color sidebar is independent of each page's accents. Technical module IDs, route paths, employee permission gates, tenant isolation, pricing, finance calculations, account security and the isolated demo database are intentionally unchanged. Do not restore per-link `data-module-accent` inside the sidebar: the canonical palette generator now treats that as a regression.
