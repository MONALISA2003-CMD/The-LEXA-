# LEXA GitHub E2E, Vercel and Render — deployment repair (7 November 2026)

## Checked evidence (read-only, no production changes)

- GitHub source refresh **42345625288** completed successfully, producing main commit `a5df7b27d972789eaa8122f9539ad74a7b4b1619`.
- The subsequent GitHub isolated browser E2E run **42345731201**, job **128322940981**, failed 6 tests. Every recorded failure was in the shared local-business fixture before the feature-specific steps, when it searched for the deleted Overview heading `Your business at a glance`. Current DashboardPage displays `Today at {businessName}.` in `.overview-hero` and shows the business again in `.overview-context strong`.
- Vercel project `lexa_review` (production deployment `dpl_FnsL84Bkhw1B9gdpUiLT83V9MLpo` at the same Git commit) failed in **prebuild** with `python3: can't open file '/vercel/path1/../scripts/check_module_group_palette.py'`. Vercel builds the `lexa-frontend/` project root, not the full monorepo; its prebuild may not reference `../scripts`.
- Vercel project domains returned `lexaaamaal.com`, `www.lexaaamaal.com` (308 redirect to apex), and `lexareview.vercel.app`; **`app.lexaaamaal.com` and `demo.lexaaamaal.com` were not attached to that project** at the time of inspection. Do not assume the planned subdomains are operational.
- **Two deployment configurations have intentionally different indexing policies.** The production LEXA business application (`lexa-frontend/vercel.json`) correctly adds `X-Robots-Tag: noindex` for private app routes. The public marketing source is separately deployable from `lexa-frontend/marketing/` using its own `vercel.json`, `robots.txt` and canonical URLs. Do not weaken the app noindex rule to fix marketing indexing; provision/verify the marketing site separately.
- Render connector identified a workspace named `My Workspace` but **refused to list services without explicit user workspace selection**. No Render deployment history or application log was available to inspect; claims about the root cause of Render failures would be guesses. No Render resources have been modified.

## Source corrections

1. Move the canonical eleven-department color validator to `lexa-frontend/scripts/check_module_group_palette.py`, where it only reads `lexa-frontend/src/` and executes under frontend-only Vercel checkouts. `scripts/check_module_group_palette.py` remains as a compatibility delegator for full-repository CI.
2. Update frontend `prebuild` to call `python3 scripts/check_module_group_palette.py` after the catalogue gate, preserving the existing source-generator, Vitest, typecheck and bundle pipeline.
3. Update the Playwright `openLocalBusiness` fixture to check the **actual created business name** inside the dashboard's Overview heading and context instead of the obsolete headline. This does not skip the intended E2E workflows.
4. Preserve the existing private app noindex header and independently deploy the public `lexa-frontend/marketing/` site. Do not send live traffic to the proposed app/demo subdomains until they are provisioned and verified; the root SPA currently doubles as a legacy customer workspace, so a root landing redirect is NOT safe without an app-route migration.
5. Add backend regression tests simulating a Vercel frontend-root-only checkout and validating the updated browser fixture. Existing tests verify the private-app/public-marketing indexing split.

## Local verification and limits

- `python3 scripts/check_module_group_palette.py` from repository root: pass (11 departments, 65 module routes).
- `cd lexa-frontend && python3 scripts/check_module_group_palette.py`: pass.
- Frontend-only Vercel prebuild source generators (`VERCEL=1`): pass in a copy containing only `lexa-frontend/`.
- Backend Node suite and backend Python suite, OpenAPI, route adapter, backup inventory and four catalogue-contract checks: pass.
- Full `npm ci`, TypeScript typecheck, Vite build and Playwright browser tests could not be rerun locally because this container cannot access the npm registry, and source-import ZIPs intentionally omit npm lockfiles. GitHub Actions must validate all of those after upload.
- The Render service/deployment/log audit remains **blocked pending workspace selection**, and service startup/readiness in production is **not certified**.

## Safe release order

1. Upload exactly one GitHub source ZIP and allow the existing repository-import workflow to complete: lockfile restore, backend tests, Nest build, frontend Vitest, TypeScript and Vite build, then source commit.
2. Confirm the follow-on isolated browser E2E workflow passes. Failures beyond the stale setup assertion require inspection, not suppression.
3. Confirm the new Vercel application deployment is READY and its build logs show that the frontend-local palette validation passed. Preserve private app noindex and API rewrites; check public marketing URLs only on the separately provisioned marketing project.
4. Select the intended Render workspace and inspect the actual deploy statuses, build failures, startup/migration errors, service health and dependency/configuration differences **before any production restart or migration**.
5. Resolve app/demo subdomain and authorization/cookie routing intentionally after successful staging and live login tests. Do not use the root marketing rewrite to break current customers' `/` dashboard.
