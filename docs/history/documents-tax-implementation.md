> **Historical implementation report (1 November 2026):** Worker and ClamAV deployment status below is historical. The 3 November current deployment guide and worker runbook control current release decisions.

# LEXA Increment 2 implementation report

Date: 2026-11-01

## Implemented in source

- Hardened the shared `platform_attachments` lifecycle: ten-minute upload initiation, 25 MiB server-side cap, allowlisted declared types, magic-byte MIME detection, SHA-256 verification against actual R2 bytes, uploader binding, immutable conditional PUT, quarantine/clean prefixes, ETag-bound clean copy, 60-second signed downloads, record-level authorization and download audit events.
- Added Inbox participant re-checks for list/download and sender-uploader binding on message attachment IDs. Attachment-only messages remain possible; the server and UI enforce ten files per message and 25 MiB per file. UI surfaces pending, clean, quarantined and scan-failed states.
- Updated the worker to verify checksum before scan, use ClamAV INSTREAM, distinguish infected (`quarantined`) from unavailable/timeout (`scan_failed`), move clean objects to a fresh clean key, remove expired pending uploads and never make failed scans downloadable.
- Added a tax reference library, original clean attachment linking, two-person review/approval, version/supersedes metadata, effective-dated tax-code rule versions, reference-document links, calculation preview and tax snapshot summary UI/API.
- New POS sale lines snapshot taxable amount, tax amount, code/description, rule version, inclusive/exclusive method, rounding and reference-document version. Configured tax codes without an approved effective rule/reference now block checkout rather than silently using an unreviewed rate.
- Added OpenAPI route inventory for platform attachments and tax endpoints.
- Corrected known frontend/backend compile defects in the local source package, including the Render `AccountingPeriod.startsOn` field and Vercel checkout/payment/inbox/overdue-state issues. The `complete_modules.py` build script now deduplicates overdue declarations and supplies all required payment draft fields.

## Database and storage applied

- Applied the Workstream 7 platform foundation to Neon main branch `br-snowy-hill-ba5a9ggc`, including `platform_attachments`, platform jobs, worker heartbeats and tenant RLS (migration `e50b4a51-faeb-4734-8731-62b295579386`).
- Applied Increment 2 tax-reference/rule tables and tenant RLS (migration `851c2588-aaa9-42cf-8696-e23a6dda1275`), plus sale-line tax snapshot columns (migrations `5e6293c2-3e63-4c30-937e-c74dde2fc0dd` and `29591889-4cf9-46d9-acfa-b5085f2146a2`).
- Applied `taxable_minor` and reference-document version columns; backfilled existing taxable values as `max(0, line_total_minor - tax_minor)` without recalculating historical tax.
- Recorded the corresponding applied migration names/checksums in `_prisma_migrations` so Prisma deploy will not replay already-applied SQL.
- Verified the live schema contains the attachment and tax tables/columns and that tenant RLS is forced on the new tax tables.
- Verified Cloudflare R2 bucket `lexa-private-platform-files` is APAC/Standard, managed `r2.dev` disabled, no custom public domains. Replaced its CORS policy with exact LEXA HTTPS origins and minimum methods/headers. No public bucket access was enabled.

## Checks completed

- Backend source tests: **49 passed, 0 failed**.
- OpenAPI exact route coverage: **280 operations across 219 routes; no missing or orphan operations**.
- Route-to-adapter coverage: **17 adapters passed**.
- Ledger coverage: **9 workflows passed**, including idempotency, balance invariants and branch checks.
- TypeScript syntax transpilation of changed backend/frontend modules passed.
- Neon migration tests passed on temporary branches before applying to main.

## Release blockers — do not promote production yet

1. Dependency-backed local backend/frontend builds and HTTP/database end-to-end tests were not completed. Local `npm install` timed out; syntax transpilation and source tests are not a substitute for full `tsc`, `vite build`, Nest build or HTTP integration.
2. Live Neon contains no sales, sales orders, fulfilments or deliveries to exercise. No live POS or delivery API workflow was executed end-to-end. Seeded synthetic tests against an isolated environment are still required.
3. Render's current deployment is `build_failed` on the old GitHub commit. Its latest build error is `AccountingPeriod.startDate` (the model field is `startsOn`); the local source package fixes this. The current Vercel production deployment is `ERROR` with TypeScript failures in the old GitHub commit; the local source package contains fixes and makes the module-completion build script idempotent.
4. GitHub branch creation returned HTTP 403 (`Resource not accessible by integration`). No source was pushed, no PR was opened, and no Render/Vercel deployment was triggered. The updated source ZIP is the delivery fallback.
5. No dedicated ClamAV background worker service was found in the Render LEXA workspace. The scanner implementation refuses to start without R2, Redis and ClamAV configuration and fails closed, but uploads will remain pending/scan-failed until a private worker and ClamAV service are deployed and health-checked. Existing bucket-scoped S3 credentials could not be inspected. A Cloudflare token-creation attempt returned HTTP 400 because the API rejected the policy reuse request; no new credential was created and no Render secret was changed. Follow `docs/increment2/PRIVATE_DOCUMENTS_OPERATIONS.md` before enabling production uploads.
6. Payment evidence attachments, inbox attachment lifecycle, and tax-reference approvals require the scanner service to be live before they can be accepted in production.

No production promotion was performed. LEXA does not submit tax returns or initiate payment-provider/courier operations in this increment.
