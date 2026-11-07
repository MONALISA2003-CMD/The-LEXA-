# LEXA Public Landing + Interactive Demo (phases 1–5)

## Deployment boundary — do not combine applications

| Component | Source/build | Domain | Data |
|---|---|---|---|
| Public site | Vercel project `lexa-marketing`, root `lexa-frontend/marketing`, static HTML, no API | `lexaaamaal.com` | none |
| Customer app | Existing Vercel `lexa_review`, root `lexa-frontend`, unchanged `lexa-frontend/vercel.json` | `app.lexaaamaal.com` | **production** Render + Neon `lexa` |
| Visitor demo | New Vercel `lexa-demo`, separate deploy bundle built from `lexa-frontend/dist` using `scripts/build_demo_vercel_bundle.py` and `docs/deployment/vercel.demo.json` | `demo.lexaaamaal.com` | **new** Render service + Neon `lexa_demo` |
| Demo API | New Render `lexa-demo-api`, `backend/Dockerfile`, `docs/deployment/render.demo.yaml`, *not* `render.yaml` | `lexa-demo-api.onrender.com` | separate Neon project |

**Never point the new demo Vercel project at the production frontend root** `lexa-frontend` without a separate rewrite config. That root contains an API proxy pointing to the PRODUCTION Render endpoint. The demo-specific `docs/deployment/vercel.demo.json` must be used for the demo Vercel deployment and sends traffic exclusively to the demo API. It is intentionally not at the repository root because the GitHub source importer rejects extra root config files. Do not remove the production site's domain until the public site has passed checks and bookmark redirects are arranged.

## Neon database and migrations

1. Create an entirely new Neon PostgreSQL 17 project in `aws-eu-central-1`, preferably called `lexa-demo`, using **an empty database named `lexa_demo`**. DO NOT branch from the production `lexa` project: never copy customer PII or ledgers to a public trial.
2. Create the approved least-privileged `lexa_app_runtime` role via LEXA's existing ordered migrations. Maintain separate login and runtime roles.
3. Set DEMO API `DATABASE_URL` to its pooled `lexa_demo` URL and `DATABASE_URL_UNPOOLED` to the same database's direct URL. These values must NOT be production strings. Never commit passwords.
4. Deploy the demo API Dockerfile; its migration coordinator runs `prisma migrate deploy` against **only** `lexa_demo`, then starts the API. The runtime checks `current_database()='lexa_demo'` at startup and on provisioning and deletion.
5. Confirm the demo migration `20261111100000_isolated_demo_sessions` applied; verify all demo session RLS policies and restricted function grants. Never run migration-reset against production.
6. The RLS-enabled demo database stores individual visitor tenants. Demo access is signaled by `demo_sessions` and an isolated temporary `active` subscription ONLY within `lexa_demo`, not by any real payment claim. This does not change real-customer entitlements.

## Render demo backend

Use `docs/deployment/render.demo.yaml` as a **separate** blueprint; production remains `render.yaml`. Set `LEXA_RUNTIME_MODE=demo`, `DEMO_DATABASE_NAME=lexa_demo`, `DEMO_ORIGIN=https://demo.lexaaamaal.com`, `DEMO_TURNSTILE_ENFORCE=true`, `TURNSTILE_SECRET_KEY`, and a separate random 32+ character `DEMO_IP_HASH_SECRET`. Configure `FRONTEND_ORIGINS` for demo host only. Do NOT copy production Resend, AI, payment, R2 or worker secrets. Outbound email and provider AI calls are blocked in demo mode even if supplied by mistake. The demo service must have a bounded compute/operational budget and request alerts.

## Vercel demo frontend

Run `cd lexa-frontend && npm ci`, then run `VITE_TURNSTILE_SITE_KEY=<PUBLIC_DEMO_SITE_KEY> python3 scripts/build_demo_vercel_bundle.py --output /tmp/lexa-demo-vercel` from the repository root. The builder **runs the actual frontend build itself** with `VITE_LEXA_DEMO=true`, `VITE_DATA_PROVIDER=api`, and `VITE_API_BASE_URL=/api/v1`, verifies that every API rewrite targets only the demo backend, and places the demo-specific routing config at the output root. It will not reuse a potentially production-configured `dist`. Deploy that generated directory as a **separate** Vercel project `lexa-demo`, not as a Git-connected source build using the production frontend config. Set:

- `VITE_LEXA_DEMO=true`
- `VITE_DATA_PROVIDER=api`
- `VITE_API_BASE_URL=/api/v1`
- `VITE_TURNSTILE_SITE_KEY=<PUBLIC demo-specific site key>`

Important: verify Vercel build root/working directory and build output in a preview deployment before connecting the public domain. The demo `vercel.json` exists only in the generated Vercel deployment directory; its source is `docs/deployment/vercel.demo.json`. The production `lexa-frontend/vercel.json` stays unchanged. Register `demo.lexaaamaal.com` as an allowed domain for the demo Turnstile widget and Siteverify action `demo`. Keep the demo noindexed.

## Vercel marketing homepage

Create `lexa-marketing` using the `lexa-frontend/marketing` directory as a static site (no frontend npm build). Set its output directory to `.` or leave unset for static deployment, depending on Vercel framework settings. Connect the verified `lexaaamaal.com` domain only after `app.lexaaamaal.com` is established for existing customers and their sign-in/deep-link redirects are tested. The indexable HTML homepage has canonical, OpenGraph, SoftwareApplication structured data, an XML sitemap and feature/pricing/security/help pages. Register its sitemap with Google Search Console. Do not use SEO `noindex` for marketing. Existing `/lexa.html` redirects to `/` once the new site is live.

## API contract

| Request | Effect |
|---|---|
| `POST /api/v1/demo/sessions` | CSRF + Turnstile `demo`; HMAC IP rate limit; create 1 isolated visitor tenant, fake owner and sample records; issue HttpOnly session cookie; return expiry. |
| `GET /api/v1/demo/session` | Validate current cookie, database membership, absolute expiry and idle expiry. |
| `POST /api/v1/demo/reset` | Re-provision a fresh isolated tenant before revoking the prior cookie; old tenant is queued for cleanup. |
| `POST /api/v1/demo/end` | Revoke the visitor's token and mark the tenant for cleanup. |
| `GET/POST/... /api/v1/workspaces/:workspaceId/...` | Existing LEXA business APIs, subject to demo-specific allowlist, owner membership, subscription guard, and RLS. |

The following routes are blocked in the demo: platform admin, real account signup/login, outbound integrations, webhook handling, tenant backups/restores, uploads, mass imports, genuine billing approval and hard DELETE. The owner-like role exists only inside that visitor's demo tenant, not across the platform.

## Seed and modules

`backend/src/demo/demo-seed.ts` seeds fictional business profile, 48 products, opening stock, 42 sales with related line items, payment records, stock movements, and grouped register records across 44+ supported module categories. Navigation is the existing business owner AppShell, not a mock shell. Sample amounts are live queries. External sends and money movements are simulated/blocked. Physical device integrations, supported domain-specific workflows, and other advanced operations require dedicated staging acceptance tests before claiming they all function; a module in navigation is not a certification of every underlying workflow.

## Security and cleanup

- Session hard cap 2h, idle expiry 30m. CSRF tokens, HttpOnly+Secure+SameSite session cookie, Turnstile and per-visitor hashed network limit.
- `/api/v1` demo global guard denies unspecified routes and requires active `demo_sessions` for every allowed visitor action, including GET. It checks the requested tenant against session tenant ID.
- `demo_sessions` RLS is scoped to current user + tenant. Database cleanup function only runs in database `lexa_demo`, checks expiry or explicit end, uses tenant-scoped DELETEs, and NEVER disables FK triggers or RLS.
- Cleanup is run in bounded batches every 15 minutes; failures log and retry. Expired cookies are invalid even if a cleanup run fails. Monitor failed purges and storage growth before enabling public traffic. No separate job worker should run on the demo environment.
- Printouts are marked as fictional demo; integrated messages/real payments are blocked. Keep public demo's content separate from normal customer backups, metrics and retention.

## Mandatory launch checks

1. Run `python3 scripts/check_repository_layout.py` on the extracted source and `python3 scripts/preflight_import_zip.py <archive.zip>` before uploading the source ZIP to GitHub.
2. Backend tests `cd backend && npm test` plus `npm run build` with installed dependencies.
2. Frontend tests `cd lexa-frontend && npm test && npm run typecheck && npm run build`.
3. Run real HTTP demo start/session/expire/reset/end against demo API and verify the cookie, CSRF and Turnstile flow.
4. Open every visible module and test at least one authorized create/read/update path where supported; verify sales, stock, finance and report totals.
5. Start two independent mobile/private browsing sessions; verify no cross-tenant reads/writes, no privileged routes, no real email/AI/payment integration, and no production Neon query.
6. Run expiry and cleanup against a throwaway demo tenant and verify all tenant data removed; never use an active session or live customer tenant for cleanup tests.
7. Verify production legacy accounts still sign in; production admin controls function; new business accounts remain subscription-pending until payment verified.
8. Verify Vercel routing: marketing indexable, demo noindexed, customer app signin/deep links, separate Render API hosts. Test responsive mobile navigation, branded URLs, payments and renewals.
9. Monitor database/storage/cost/Turnstile rate limits after release and limit simultaneous visitor creation if resource budgets are exceeded.

**Current release status:** source implementation only until staging database and real deployment checks pass. This document is not an assertion that the live website or any custom domain has changed.

## GitHub ZIP importer parity: prevent Actions #149 failure

The GitHub repository-import workflow accepts only these directory roots: `backend/`, `lexa-frontend/`, `docs/`, and `scripts/`. It rejects arbitrary top-level files such as `LEXA_DEMO_RELEASE_NOTES.md`, `render.demo.yaml` and `vercel.json`, and rejects a top-level `marketing/` directory. Demo manifests belong at `docs/deployment/render.demo.yaml` and `docs/deployment/vercel.demo.json`; the public static website belongs at `lexa-frontend/marketing/`, and release notes belong at `docs/quality/`.

For every release, generate the upload ZIP **from the canonical source folder**, not by zipping an export folder or staging build directory. Do not include `.github/`, generated folders, local secrets, or a wrapper directory. The workflow preserves its own `.github/workflows/` when importing.

```bash
cd /path/to/lexa-source
python3 scripts/check_repository_layout.py
python3 -m unittest discover -s scripts/tests -p 'test_import_zip_preflight.py'
python3 scripts/build_source_import_zip.py /path/outside/repository/LEXA_Import.zip
python3 scripts/preflight_import_zip.py /path/outside/repository/LEXA_Import.zip
```

`build_source_import_zip.py` uses ZIP deflate level 9 for broad compatibility, and verifies the created archive using the **same structural rules** as the live GitHub workflow. `preflight_import_zip.py` lists **all** invalid entries, rather than stopping at the first one. Python ZIP-LZMA is optional but is not recommended unless it produces a meaningful size improvement. Image assets are preserved; any brand-asset PNG recompression must be lossless and pixel-verified.

**Important:** This import-specific fix does not certify production deployment. After uploading the root-level ZIP, confirm the entire `Refresh LEXA from a clean repository ZIP` workflow is green, including npm install, Prisma validation, backend test/build, and frontend build. Resolve any later failure from its logs; avoid switching live Render/Vercel traffic before those gates pass.
