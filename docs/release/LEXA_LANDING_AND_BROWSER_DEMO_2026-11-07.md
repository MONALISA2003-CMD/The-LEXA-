# LEXA public website and browser demonstration — 7 November 2026

## What this release changes

The primary domain `https://lexaaamaal.com/` serves the public website. Its homepage has a real LEXA header, distinctive 11-business-area visuals, a locally bundled shop illustration, linked-sale workflow, product-screen illustration, industry cards, demo explanation, pricing, FAQs, and mobile/desktop responsive CSS. The marketing text is specific to sales, inventory, purchasing, finance, customer records, teams, production and service.

The public demo CTA points to `https://lexaaamaal.com/demo/` because the previously advertised `demo.lexaaamaal.com` address returned a DNS error in the supplied recording. This **does not** claim or configure that DNS name. A future separate Render/Neon-backed demo remains an independently deployable option, but the primary demo entry does not depend on it.

A second, compile-time-isolated Vite build lives under `/demo/`. It is based on the existing LEXA React application, existing standard record manager and local business repositories. The seeded fictional business has 48 priced products across five product groups, 42 linked sales with receipt lines and matching stock movements, associated payment records, and named records in all 54 standard business-area registers. Finance and reports use recorded sample sale, payment and stock data for their totals, while sample finance/payroll/accounting registers are explicitly **illustrative** and not falsely described as posted accounting transactions. Sensitive actions requiring real identity, payment, integrations or server-side authorization are intentionally disabled or replaced by a safe browser-only presentation.

## Three build outputs

| Route | Build artifact | Purpose |
|---|---|---|
| `/` | `dist/index.html` (copy of `public/lexa.html`) | Public marketing website; indexable |
| `/sign-in`, `/create-account` and other app routes | `dist/app.html` | Real customer API-backed application; noindex |
| `/demo/`, `/demo/demo`, `/demo/products`, `/demo/modules/...` | `dist/demo/index.html` and `/demo/assets/*` | Browser-only demo, noindex |

The frontend's `npm run build` does a conventional TypeScript + Vite build and an additional explicit Vite build with `VITE_LEXA_BROWSER_DEMO=true`, `VITE_DATA_PROVIDER=local` and `/demo/` base. Do **not** bypass `scripts/build-browser-demo.mjs` or accidentally deploy `dist/app.html` as the main-domain homepage.

## Isolation rules

- The customer app stays in `api` mode for production builds. The demo is enabled only by a compile-time flag plus the `/demo/` base URL.
- The browser demo refuses API requests; its Dexie database and module-record storage are distinct from normal app and development storage keys.
- The sample workspace and every register contain fictional records, stored only in the visiting browser; no real customers, bank transactions, email, payment submissions or tax filings.
- The demo expires after two hours and may be reset without touching production data.
- These are UI exploration data, not a substitute for a separate backend demonstration environment and its full transaction/permission tests.

## Verified locally

- 479 backend Node tests and 18 backend Python tests passed after enabling the globally installed TypeScript parser for the four AST-based test files; no package manifests or dependency locks were altered.
- 362 TypeScript/TSX source files parsed, with 1,232 internal imports checked. The two imports of Prisma's generated client are expected to exist only after `prisma generate` in CI.
- Module colors (11 groups / 65 navigation routes), public demo release preflight, navigation generator tests, 57 SQL migration structural checks, route uniqueness (563 registrations) and backup inventory coverage passed.
- The homepage was visually checked in Chromium at 320, 390, 820 and 1440 px without horizontal page overflow. This is a **rendering probe**, not a full authenticated browser E2E run.
- The ZIP is checked using `scripts/preflight_import_zip.py` and GitHub's canonical source layout rules.

## Important remaining gates

**This source package has not been published.** GitHub must install its locked npm dependencies, run the frontend TypeScript build, Vitest suite, built-demo Vite pass, isolated Playwright workflow, and deploy Vercel. Check `https://lexaaamaal.com/` and `https://lexaaamaal.com/demo/` in a real deployed browser, confirm the network panel shows no production API calls in the demo, and inspect the seeded registers. Do not call the production release green before these gates pass.

Use the existing root-level ZIP-import workflow. Its importer preserves `.github` workflows and restores npm lockfiles from Git; the source ZIP intentionally excludes both and does not alter production Render/Neon resources.
