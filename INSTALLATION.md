# LEXA Operational Workflows — Increment 2 installation

## Install from a phone

1. Download `LEXA_Operational_Workflows_Increment_2.zip`.
2. Upload the ZIP to the repository root of `MONALISA2003-CMD/The-LEXA-` on branch `main`. The existing GitHub ZIP extractor will extract the files into their matching folders and remove the uploaded archive in its follow-up commit. Alternatively, extract the ZIP over the repository and merge the folders without deleting unrelated files.
3. Let the GitHub ZIP extractor finish. It creates a follow-up commit named `Extract repository ZIP archives`.
4. Keep Render's Docker Command override blank. The existing Dockerfile runs `npx prisma migrate deploy` before starting NestJS.
5. Let Render and Vercel deploy the extracted commit. Do not run manual SQL against production.
6. Verify backend readiness and the new migration before testing transactions. Use a non-production workspace first.

## What changes

The existing Sales orders, Purchase orders, Goods receiving, Deliveries & fulfilment, CRM Leads, Customers and Suppliers screens gain transactional workflow panels. Sales orders, Purchase orders, Goods receiving and Deliveries become read-only in the generic editor; creation and status changes must use the typed workflow actions so stock postings cannot be bypassed.

No new environment variables or provider credentials are required. All API actions use the existing session, active workspace membership, branch scope and CSRF protections.

## Deployment acceptance checks

- GitHub `main` contains the extracted Increment 2 files and the follow-up extractor commit is complete.
- Render is live on that exact commit and `https://lexa-backend-api-live.onrender.com/health/ready` returns `ready` with database dependency `ok`.
- Vercel production is `READY` on the same commit.
- `_prisma_migrations` contains a successful row for `20261030190000_commerce_workflows`.
- The ten new `commerce_*` tables exist.
- Sign in and test a small order, dispatch, purchase order and goods receipt in a non-production workspace before using live inventory.

Do not manually insert or delete production business rows to test this increment. The migration is additive and is applied by the existing Render Docker startup command.
