# Workstream 7 — Completion patch and external acceptance gates

## Implemented in this patch

- Registered `PlatformController` in NestJS. Previously the controller existed in source but was not included in `AppModule.controllers`, meaning its routes were not active.
- Enabled Inbox attachment upload initiation for a conversation only after verifying the authenticated user is a conversation participant in the same workspace and branch.
- Bound attachment completion to the original uploader; downloads remain clean-only and short-lived, and conversation participants may download conversation-linked attachments. Workspace/branch scope is checked on every API request.
- Enabled Inbox UI file selection and upload using SHA-256, signed R2 PUT headers, completion confirmation, and message attachment IDs. The existing backend checks that attachment IDs belong to the same conversation and branch. Maximum 10 attachments per message; existing 25 MiB MIME allowlist applies.
- Added `attachmentIds` to the collaboration message contract and API repository.
- Added a local operational stack with Redis persistence, ClamAV, API and a separate worker process in `deploy/workstream7/docker-compose.yml`.

## Existing platform foundation retained

- Private R2 bucket and restricted CORS configuration provisioned in the connected Cloudflare account.
- Tenant/branch-scoped attachment metadata, durable platform job schema, provider connection/operation schema, webhook deduplication, worker heartbeat schema, outbox retry metadata.
- Signed R2 upload/download URLs, MIME/size allowlist, HEAD metadata check, SHA-256 verification and fail-closed ClamAV scan path.
- BullMQ worker process and transactional outbox polling foundation.

## Not honestly certifiable from this environment

The following require access or evidence that is not available in the connected accounts/environment. They are deliberately not represented as completed:

1. **Render Redis + worker deployment:** Render rejected creation of a new Key Value instance with HTTP 402: billing information is required. No Redis instance, worker service or ClamAV service was provisioned in Render. Use the included Compose stack for a disposable staging environment or enable Render billing and create a private Key Value plus Background Worker.
2. **R2 credentials:** bucket exists and CORS was verified, but an R2 S3 API token was not created. Add bucket-scoped Object Read & Write credentials to Render secrets (`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ACCOUNT_ID`, `R2_BUCKET`). Never put these in Vercel.
3. **Import/export/backup/restore:** durable job records exist, but complete typed processors for every authoritative table, file manifest streaming, encryption/key management, point-in-time consistency, and restore execution have not been implemented or run. Restore remains disabled. Do not enable `PLATFORM_RESTORE_ENABLED` until a staging restore implementation passes the drill in `docs/workstream7/RESTORE_DRILL.md`.
4. **Provider integrations:** generic provider connection/operation and webhook-deduplication persistence exists, but MTN MoMo, Airtel Money, bank, carrier, tax and transactional-email provider-specific production adapters are not sandbox-verified. Each requires merchant account sandbox credentials, webhook signing secrets, provider test endpoints and provider-specific contracts. Settlement must stay pending/unknown until provider-side status confirmation.
5. **Notifications and recurring invoices:** notification/outbox foundations exist, but event-specific handlers and recurring invoice schedule/ledger posting/idempotency are not complete. Do not mark unknown events processed.
6. **Observability:** dependencies and environment placeholders exist, but Sentry/OTel export, metrics auth, alert delivery, dashboards and operational restore drills require configured endpoints and deployed worker infrastructure.

## Deployment safety

- Apply the Prisma migration only through the normal migration deployment process against a disposable staging Neon branch first.
- API and worker require the same schema version. Worker database role must be least-privilege; do not use a superuser in production.
- Configure Redis and ClamAV privately, never expose their ports publicly.
- Keep `PLATFORM_RESTORE_ENABLED=false` until a verified staging drill is recorded.
- Provider webhook handlers must verify signatures and deduplicate provider event IDs before business state changes.


## Latest continuation changes (2026-10-31)

- Fixed attachment completion authorization to compare against the authenticated actor (the previous code referenced an undefined variable).
- Added tenant/branch-scoped attachment listing with uploader/admin/conversation-participant visibility checks.
- Inbox message cards now expose clean-only signed downloads; composer picker validates the per-file 25 MiB cap and supports attachment-only messages.
- Added regression tests for uploader binding, participant visibility, signed headers and short-lived downloads.
- Full backend test suite: 38/38 passing.
- The frontend and backend production builds have not been run in this checkout because dependencies are not installed. OpenAPI coverage script currently cannot run because `backend/src/supply-chain/supply-chain.controller.ts` is missing from the extracted checkout; route-to-adapter coverage passes 17 adapters.

## Transactional email / account recovery

- Resend domain `amaalcredit.com` was created for transactional sending, TLS enforced, tracking disabled, receiving disabled. It is **not verified** until the four DNS records in the handoff are published and Resend verifies them.
- A domain-scoped sending API key was created and installed as `RESEND_API_KEY` on the Render API service. `RESEND_FROM_EMAIL` is set to `LEXA <Info@amaalcredit.com>` and `LEXA_SUPPORT_EMAIL` to `Info@amaalcredit.com`. Password reset remains dependent on successful domain verification/delivery.
- Cloudflare account does not currently manage `amaalcredit.com` (no matching zone found), so Cloudflare Email Sending cannot be onboarded without first adding/transferring the domain to Cloudflare DNS. Do not change MX records until the current mailbox provider and mail routing are confirmed.
- No Resend webhook was created because no signed webhook receiver endpoint exists in this application yet.

## Remaining hard gates

- Render Redis creation was rejected with HTTP 402 (billing information required). No Redis service, worker service or ClamAV host has been deployed in Render.
- R2 bucket exists but an S3 API token has not been provisioned; API upload/download will remain unavailable until bucket-scoped credentials are configured.
- Full import/export/backup/restore processors and staging restore drill remain unimplemented/unverified. Restore stays disabled.
- MTN MoMo, Airtel Money, banks, carriers and tax adapters need merchant-issued sandbox credentials and provider-specific test contracts. No money state may be marked settled without authenticated provider confirmation.
- Event-specific notification/recurring-invoice handlers, Sentry/OTel exporter configuration, metrics/alerts and staging operational runbooks remain to be deployed and verified.
