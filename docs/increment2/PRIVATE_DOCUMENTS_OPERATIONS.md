# Increment 2 — Private documents and tax references

## R2 bucket and access boundary

- Cloudflare account: `fd30d011f3df62adac89458dbe45de90`
- Private bucket: `lexa-private-platform-files`
- Region: APAC (Standard)
- Managed `r2.dev` endpoint: disabled
- Custom public domains: none
- Never publish bucket/object URLs or put R2 credentials in frontend/Vercel `VITE_*` variables.
- Browser upload uses a 10-minute presigned PUT, immutable random `quarantine/<uuid>` key, declared content type, SHA-256 metadata and `If-None-Match: *`.
- Clean files are moved to a fresh `clean/<uuid>` key only after checksum re-verification and ClamAV success. Downloads are presigned GETs for 60 seconds and only for clean objects after fresh record-level authorization.

### Verified CORS policy

Allowed origins are exact HTTPS origins only:

- `https://lexareview.vercel.app`
- `https://lexareview-kabuusumohammed182-7875s-projects.vercel.app`
- `https://lexareview-git-main-kabuusumohammed182-7875s-projects.vercel.app`

Allowed methods: `GET`, `PUT`, `HEAD`. Allowed request headers: `Content-Type`, `Content-MD5`, `If-None-Match`, `x-amz-meta-lexa-sha256`, `x-amz-checksum-sha256`. Exposed response header: `ETag`. Max age: 3600 seconds. Recheck this list whenever the production frontend origin changes; do not use `*`.

### Bucket-scoped credential creation and rotation

The bucket privacy and CORS settings were verified and corrected. A bucket-scoped token creation was attempted through the connected Cloudflare API but returned HTTP 400 (`Reusing existing policies is not supported by token creation`); no token was created and no Render secrets were changed. Existing Render secret values could not be inspected safely through the connected deployment API. Before enabling uploads in production:

1. In Cloudflare R2, create an S3 API token with **Object Read & Write** permission scoped only to `lexa-private-platform-files` (not all buckets/account-wide).
2. Store its access key ID and secret only in Render API and worker secret environments as `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY`; set `R2_ACCOUNT_ID` and `R2_BUCKET` server-side. Never commit these values or expose them through `VITE_*` variables.
3. Verify that the API can presign and complete an upload, and that the worker can read quarantine objects, copy to `clean/`, and delete expired/quarantined objects.
4. For rotation, create a second bucket-scoped credential, update API and worker secrets together, redeploy both, run a clean-file scan/download check, then revoke the old credential. Record the rotation time and operator in the deployment change log.
5. If any verification fails, disable upload initiation and keep downloads closed; do not fall back to public bucket access.

## Worker requirements

The worker must run as a separate private/background process with:

- `REDIS_URL` pointing to the existing private Render Key Value service;
- `WORKER_DATABASE_URL` using the server-side database role required for worker queues and tenant-scoped processing;
- `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`;
- `CLAMAV_HOST` and `CLAMAV_PORT` (default `3310`) pointing to a private ClamAV service, never a public scanner endpoint.

ClamAV must support the INSTREAM protocol. Infected files become `quarantined`; scanner absence, connection errors and timeouts become `scan_failed`. Both states are permanently ineligible for download. A missing scanner must never be reported as a healthy scanning capability.

## Object lifecycle and retention

- `quarantine/`: pending upload and pending scan only.
- `clean/`: scanner-approved objects only.
- `exports/`: generated exports (not yet enabled by this increment).
- `backups/`: backup objects (not yet enabled by this increment).
- Metadata records tenant, optional branch, owner, original/display filename, declared/detected MIME, size, SHA-256, uploader, scan result, visibility and retention state. Random object keys do not contain tenant IDs or business record IDs.
- Pending uploads expire after ten minutes; the worker removes expired objects and metadata is retained as deleted.
- Legal holds and pending deletion are represented in metadata; automated retention purge is intentionally not enabled until a retention schedule is approved.

## Inbox access

- Upload initiation validates active branch and conversation participation.
- The message sender must be the uploader of every linked attachment (or a future explicitly authorised admin flow).
- A message may contain only attachments; the server enforces ten attachments maximum and 25 MiB per file.
- Listing and every download URL request re-check current participant status. Pending, quarantined and failed scans never receive download URLs.
- Presigned download links expire after 60 seconds; removal from a conversation blocks renewal after expiry.

## Tax reference and rule governance

- Tax reference originals must already be `clean` before they can enter the review library.
- Documents and rule versions progress `draft` → `under_review` → `approved`; submitter/reviewer cannot be the approver.
- Rule versions require at least one approved reference document and cannot overlap another approved effective period. A newly approved later version closes the previous approved version the day before the new effective date and marks it superseded.
- Checkout refuses a configured tax code that has no approved effective rule linked to an approved reference. Historical sale lines retain taxable amount, tax amount, tax code/description, rate, method, rounding, rule version and reference document version snapshots. Later rule changes do not recalculate past invoices.
- LEXA records calculations from approved configuration. It does not submit returns, connect to a filing provider or certify legal compliance.
