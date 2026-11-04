# LEXA adaptive identity, owner intelligence and release audit

**Date:** 4 November 2026  
**Scope:** LEXA owner's supplied LX logo; electric-blue sign-in; AI free-tier reliability and presentation; business-only and prompt-injection controls; responsive navigation branding; source and API contract validation.  
**Source basis:** Clean owner-assistant source import that passed GitHub Actions #66 on its second attempt.

## Confirmed incident and correction

The connected Render logs for approximately 09:55–09:57 UTC showed an Intelligence status request returning HTTP 200, a quick assistant request returning 201, and later explanation POST requests returning 403. The inspected production database workspace reported a monthly 60-request plan allowance, **zero** usage counter rows consumed in that period and zero AI usage events. This is inconsistent with the customer-facing "monthly allowance used" explanation. The exact HTTP error payload was not available from the request logs; the root cause was not independently proven from authenticated response bodies.

Source hardening:

1. Fast greetings, business-only boundaries and straightforward inventory/sales/finance calculations do **not** reserve a provider request.
2. AI usage reservations and completions now explicitly preserve validated tenant context inside each RLS-backed transaction.
3. A failed provider call releases both reserved budget and request count. Existing successful usage remains counted.
4. A failed usage-record insertion with apparently remaining allowance is reported as an availability error, **not** falsely as quota exhaustion.
5. AI model attempts finish within a 19.5-second server budget, below the frontend 25-second request timeout; each provider attempt is capped at 4.5 seconds.
6. Only authenticated owners have access; read-only aggregated facts are separated from system instructions. Models never receive executable financial, payroll or inventory tools. Existing draft write actions still require explicit owner confirmation and the governed business APIs.
7. Model responses are normalized into business prose and headings. The frontend renders bold and lists using escaped React text, not raw HTML or unsafe Markdown interpretation.

**Free-tier limitation:** The deterministic operational assistant works without a provider key. Open-ended medium-complexity model responses still require correctly configured and reachable free provider API keys on Render, and provider quota or billing may restrict them. Multiple Gemini keys in the same Google Cloud project share limits. We did not change secrets or probe the user's confidential API keys. Paid-model fallback is not silently enabled.

## Branding

The approved uploaded LX logo was used to construct five real assets: `lexa-logo.png` (transparent horizontal lockup), `lexa-master-symbol.png`, `lexa-master-wordmark.png`, `lexa-mark-mask.png` and `lexa-favicon.png`.

`LexaLogo.tsx` uses the actual approved LX silhouette as a small CSS image mask, allowing its colour to inherit the current module's existing named tokens. LEXA's wordmark remains stable. Mobile, tablet and desktop sizing rules, colour contrast and both themes are covered by the component's CSS. Sign-in and password recovery use the stable master identity and an electric-blue glass design, with keyboard focus, responsive and reduced-transparency accommodations. The existing AMAAL GROUP subsidiary footer is preserved.

## Module and API audit matrix

| Business area | Validation performed | Additional live requirement |
|---|---|---|
| Sales / POS / CRM | Documented API contract + shared adapters; existing automated backend tests | Authenticated sales/stock/ledger scenario |
| Inventory / Logistics | Documented endpoints + existing source integrity tests | Physical stock and dispatch reconciliation |
| Purchasing | Documented procurement endpoints + existing approval tests | Full request-to-pay scenario |
| Finance | Ledger posting coverage, inventory/backup controls, existing backend tests | Posted entries, tax and tenant cross-access testing |
| Team / Payroll | Existing controllers in full route coverage | Pay-run and protected employee access tests |
| Manufacturing / Quality | Existing controllers in full route coverage | Receipt, issue, inspection and stock movement tests |
| Projects / Support | Existing controllers in full route coverage | Authenticated project/task/case operations |
| LEXA Intelligence | New business-only, RLS, failure refund, timeout, response and owner-action tests | Owner session and actual provider connectivity |
| App identity / auth | Strict syntax/import check, design-token path mapping, tested source generators | Real phone/tablet/desktop visual checks and full Vite build |

**Important:** API contract coverage is not equivalent to testing every deployed route with real authorized sessions. No new deployment or production database modification was made as part of this source package.

## Automated validation

- **Backend unit/source tests:** 200 passed, zero failed.
- **Python finance + operational analysis tests:** 10 passed.
- **OpenAPI contract:** exact coverage, 375 operations across 303 routes.
- **Backend-backed frontend domain adapters:** 17 checked.
- **Backup inventory:** 169 table decisions covered.
- **General ledger invariants:** 15 source workflows checked.
- **Navigation generator regression tests:** 3 passed; a second generator run produced zero changes to source files.
- **TypeScript/TSX syntax and relative-import scan:** 253 files, no errors or unexpected missing imports.
- **Targeted strict TypeScript checks:** new response helper, adaptive logo and response presentation components passed.
- **Neon validation-branch query check:** AI usage reservation query accepted by PostgreSQL query planner; no rows changed.
- **Import ZIP check:** root-level source, no wrapper, no .github, no lockfiles, no pycache, no build artifacts, no nested ZIPs, no secrets.

## Blocking acceptance steps before calling production green

1. Import the ZIP to GitHub using the existing validated source workflow; ensure the *new* backend and frontend builds, tests, typechecking and Vite build pass. The earlier #66 success applied to the previous revision.
2. Verify the Render backend is redeployed to the new commit with the intended environment configuration and that its database runtime role/tenant RLS context succeeds.
3. Perform authenticated owner requests: greeting, simple inventory, detailed question, confirmed draft action; verify usage reservations and cleanup through success and failure. Test forbidden non-owner requests and cross-tenant IDs.
4. Validate every critical module with a real authorized session in an isolated tenant and run transaction/reconciliation, security and mobile visual smoke tests.
5. Review real model-provider availability and terms without exposing keys or using paid models unintentionally.

Production readiness is **pending** these deployment-level checks; source validation alone cannot certify public release.
