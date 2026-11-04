# LEXA public-release hardening and Finance repair — 4 November 2026

## Source baseline and scope

The source-import package is based on the current GitHub `main` tree at commit `815afd1e1ec48a985619df85bfbe962dbae1dbf3`, incorporating the prior approved Finance, Purchasing, HR, Projects and manufacturing work. This release adds Finance read-side reliability, Business Tools notice removal and private attachment integration, better colour-coded navigation, indexable public HTML, signup Turnstile integration, regression tests and an inventory SQL correction. No production business records were deleted or modified.

## Confirmed causes addressed

- **Finance/ledger:** GET ledger accounts/periods used to call default-creation SQL. Existing valid period dates encountered the `Accounting periods may not overlap` trigger when reinserted. Normal GET routes are now read-only. `POST /api/v1/workspaces/:workspaceId/branches/:branchId/ledger/initialize` explicitly initializes missing defaults under administrator permission, CSRF protection, an advisory transaction lock and an overlap-aware `NOT EXISTS` test. No routine reads mutate accounting periods.
- **Inventory Picklists:** Live Render error `PostgreSQL 42883 operator does not exist: text = uuid` in reservation join. `stock_reservations.order_id` is text while `inventory_picklist_lines.id` is UUID. The query now uses `r.order_id=l.id::text`.
- **Finance status:** Unavailable ledger counts and trial balances must not be shown as legitimate zero or 'out of balance' amounts. Read-side unavailable state and setup prompt have been corrected.
- **Business Tools:** Deleted the two unwanted `Connected business services` and `Storage and trust boundary` blocks, with no substitute disclaimers. API mode uploads photos via existing private R2 signed URLs, SHA-256 validation, quarantine, malware scan, authorised tenant/branch references and permission-checked download; device-only support remains local where intentional. Server availability and R2/antivirus configuration require runtime validation.
- **Navigation:** Added searchable colour-coded module groups, pinned module shortcuts, automatic active-group expansion, responsive navigation styling, clearer Finance navigation and cleaned-up global search copy without internal security-implementation language. Pins reset on business switch and authorized visibility remains enforced.
- **Search visibility:** Added public HTML pages `/lexa.html`, `/features.html`, `/security.html`, `/help.html`; `robots.txt`, `sitemap.xml`, metadata, canonical URLs and SoftwareApplication structured data. The private SPA has `noindex,nofollow` and APIs have no-store/noindex headers. Search indexing is not guaranteed; submit sitemap in Google Search Console and monitor actual indexing.
- **Signup protection:** Added frontend managed Turnstile widget and backend Siteverify with action/hostname validation, network failure closed when enforcement enabled. Activate only after *both* sides and secrets are deployed.

## Cloudflare controls changed (live zone `lexaaamaal.com`)

Changes made under the user's explicit instruction to implement staged WAF, bot and client-side protections:

- Enabled client-side security/Page Shield script monitoring and reporting.
- Created active custom WAF entrypoint rule blocking requests to common probe paths `/.env`, `/.git/`, `/wp-admin`, and `/xmlrpc.php`. Existing authentication rate limits, TLS Strict, HTTPS redirects, DNS and DDoS protection unchanged.
- Created a Managed Cloudflare Turnstile widget for `lexaaamaal.com`, `www.lexaaamaal.com` and `lexareview.vercel.app`, public sitekey `0x4AAAAAAFzE4aPvB2YCgpLd`. **No secret is embedded in code or artifacts.**
- Did **not** enable global Free-plan Bot Fight Mode, which cannot exclude legitimate API requests or static crawlers. If plan permits, configure zone-specific bot challenges after traffic analysis instead.
- Did **not** create Cloudflare Access/Gateway blocking rules because no private admin hostname, staff identity policy or recovery access was provided. Gateway filters outbound staff traffic, not public web attacks. Avoid an accidental admin lockout.

## Turnstile deployment requirements

1. The **public** frontend widget sitekey is embedded by default (`0x4AAAAAAFzE4aPvB2YCgpLd`); optionally override with `VITE_TURNSTILE_SITE_KEY` in Vercel for future key rotation.
2. Configure Render backend secret `TURNSTILE_SECRET_KEY` with the Cloudflare widget's secret **in Render secrets**, not in this repository or ZIP.
3. Verify the new frontend and backend can render and validate a signup token on staging; then set `TURNSTILE_ENFORCE_SIGNUP=true` in the backend environment. With enforcement true, signup fails closed if no secret or Cloudflare is unavailable. Monitor for fraud and challenge errors. Do not force every authenticated finance call through a browser challenge.
4. Verify the Turnstile hostname allowlist includes each actual signup domain before enabling.

## Verified non-destructive validation

- 182/182 backend tests passed, including new release regression tests.
- 6/6 Python Finance analytics unit tests passed.
- Exact OpenAPI coverage **375 operations over 303 routes** passed.
- 17 API adapters covered.
- Backup inventory: 169 table decisions, passed.
- Ledger source workflow checks passed (15 flows).
- TypeScript/TSX AST parsing: 254 files, no syntax diagnostics. This is not a full strict typecheck.
- On the isolated Neon validation branch, `EXPLAIN` succeeded for the read-only ledger lookup, overlap-aware setup insertion, and repaired picklist reservation list query. No writes issued.
- Source-import ZIP structure was validated; no node modules, .github wrapper, secrets, nested ZIPs or generated Python caches.

## Blockers before declaring unrestricted public availability

- **Complete CI:** npm dependency-backed Nest and React TypeScript/Vite builds and frontend Vitest must pass on GitHub. Local npm dependencies were not available in this environment. Syntax parsing alone is insufficient.
- **Authenticated production/staging smoke:** check Cash/Money Accounts, General Ledger, Chart of Accounts, Budgets/Forecasts, checkout, Inventory Picklists, Business Tools uploads and signed downloads, and staff access by role. API traces must not show repeated 500 errors.
- **Tenant isolation:** exercise unauthorized tenant and branch IDs for every new endpoint; ensure private files and caches cannot cross boundaries. Static checks do not substitute for tenant integration tests.
- **Origin exposure:** direct Render hostname remains publicly addressable. Add suitable origin controls and backend rate limiting before calling edge protections complete; don't revoke public Render reachability before an alternate origin is tested.
- **Turnstile:** Cloudflare widget is created; server enforcement is intentionally OFF until the updated frontend + backend secret are deployed and staging tested.
- **Search:** verify domain in Google Search Console, submit new sitemap and monitor crawl/indexing, canonical behaviour and Core Web Vitals. A high ranking cannot be guaranteed.
- **WAF monitoring:** review security analytics and false positives after WAF changes; extend protection only with evidence. Current Free plan limits advanced bot and script controls.
- **Public trust:** verify published feature and security claims match operational capabilities; add legal/contact/public policy pages before full marketing launch.

## Rollback and data protection

Source changes can be reverted using previous GitHub commit/ZIP. Cloudflare custom rule can be disabled or deleted by ruleset ID `c8eb895860764eb589f4dc4b363fe9f8`; the widget can be disabled independently; client-side monitoring can be disabled independently. **No data erasure, migration execution, DNS modification, credential revocation or production deployment was performed.**
