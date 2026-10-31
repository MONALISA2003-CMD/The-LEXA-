# LEXA Workstream 7 — Platform operations implementation

## Included in this source patch

- Dedicated Cloudflare R2 bucket `lexa-private-platform-files`; the existing `amaal-product-images` bucket was left untouched. The new bucket has a restrictive CORS policy for `https://lexareview.vercel.app` only, with GET/PUT/HEAD and only Content-Type, Content-MD5 and `x-amz-meta-lexa-sha256` headers. No public domain or public access was enabled.
- Migration adds tenant/branch-scoped attachment metadata, durable job records, provider connection/operation records, webhook deduplication, import-row validation storage, worker heartbeat storage, and retry fields for the existing transactional outbox.
- API supports short-lived signed upload and download URLs using the S3 API with `region: auto`; metadata and authorization are checked server-side. File policy caps uploads at 25 MiB and allowlists MIME types. Downloads are restricted to the uploader or workspace administrator until a typed record/conversation ACL adapter is connected. Download is withheld unless status is `clean`.
- Upload completion performs an R2 HEAD check for exact content length and signed SHA-256 metadata. It then enters `pending_scan`; it is not available for download until the worker verifies bytes and ClamAV returns clean. Scanner errors fail closed and quarantine the object.
- Export job requests can be created idempotently and polled by ID. The complete export processor is not yet enabled; unimplemented job kinds are retained as failed/dead-letter rather than reported successful.
- Separate BullMQ worker process connects to Redis, heartbeats, queues pending file scans, and polls existing transactional outbox rows with bounded retries. Unknown event types are not acknowledged as processed; they remain visible for handler implementation and replay. It is not started inside the API process.
- Sentry/OpenTelemetry/BullMQ dependencies and deployment environment template are included for rollout wiring.

## Cloudflare R2 provisioning

Created via the connected Cloudflare account:
- Account ID: `fd30d011f3df62adac89458dbe45de90`
- Bucket: `lexa-private-platform-files`
- Location: APAC; Standard; default jurisdiction
- CORS origin: `https://lexareview.vercel.app`
- Existing bucket `amaal-product-images` was not modified.

Generate a bucket-scoped R2 API token with Object Read & Write for this bucket. Put the resulting S3 Access Key ID and Secret Access Key into Render secrets as `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY`. Set `R2_ACCOUNT_ID` and `R2_BUCKET`. Do not place credentials in Vercel/browser variables.

## Deployment

1. API service: set R2 variables and `REDIS_URL`; run migrations as part of the existing Render startup sequence.
2. Create a separate Render Background Worker from the same repo and Dockerfile, start command `node dist/src/platform/worker.js`.
3. Configure the worker with the same Redis and R2 secrets, `CLAMAV_HOST`, `CLAMAV_PORT`, and a least-privilege `WORKER_DATABASE_URL` that can read/write only the platform job, attachment, outbox, heartbeat, and required business tables across tenants. Do not expose this URL to the API.
4. Run ClamAV as a reachable TCP service. The scanner deliberately fails closed if it is unavailable.
5. Keep restore disabled until a separate, isolated staging restore implementation and drill are approved.

## Not yet production-certified / remaining acceptance work

This is an implementation increment, not a claim that all Workstream 7 acceptance criteria have been completed in production. Before declaring W7 complete:
- finish the typed export/import/backup/restore processors and test full authoritative-table plus object-manifest restoration in staging;
- implement actual provider-specific email, MTN/Airtel/bank/carrier/tax request and webhook adapters with provider-issued sandbox credentials; no generic status flag may mark money settled;
- connect Inbox UI attachment picker and message send/read endpoints to this metadata API with conversation participant authorization;
- complete outbox event-specific consumers (notifications and recurring invoices) and replay/dead-letter admin UI;
- add authenticated metrics/alerts and validate Sentry/OTel delivery;
- run full Nest/Vite builds and staging restore drill after dependencies and secrets are provisioned.

The worker intentionally does not mark arbitrary unknown outbox events as successfully delivered, and provider operation tables are not exposed as a fake settlement endpoint.
