# LEXA audit remediation — implementation bundle (2026-11-07)

This is not a production release. It was prepared from main
9cf4213f22c0a2a59a99ebff10e61edb82095a0e in an isolated Vercel sandbox.
GitHub rejected branch creation with HTTP 403; an authorized repository writer
must push/promote this bundle.

## Implemented in source

- Browser-contained sample under the canonical /demo/ route, with stale
  /demo/demo redirects corrected.
- Safe browser-local My business and My employment views.
- Separate deterministic Assistant guided preview using linked fictional
  sales and stock (not the live AI Assistant).
- Corrected website Security copy describing sample isolation.
- Phase-1 additive signed-Resend-webhook SECURITY DEFINER claim/finish
  functions and matching NestJS controller. The forced RLS/revocation step
  is intentionally **not** in Prisma's automatic migrations and requires
  a subsequent operator-reviewed deployment after the API has drained.
- Regression tests and a compiled demo browser test.

## Validation

- Frontend type-check: passed.
- Frontend full build: passed; 191 unit tests across 41 files passed.
- Backend migration-structure, route-uniqueness and build: passed
  using a dummy, build-only DATABASE_URL.
- Added native Node release contract tests: 4/4 passed.
- Neon validation branch lexa-audit-rls-validation-20261107: RLS and
  FORCE enabled, runtime direct SELECT rejected, tenant route INSERT
  and signed webhook mapping, finish and duplicate replay passed.
- Compiled demo Playwright smoke passed after installing Chromium dependencies;
  nine existing customer-workspace Playwright tests passed.
- Full backend: 488 Node and 18 Python tests passed.
- Fresh Neon release-candidate branch applied 16 migration statements and
  validated runtime isolation and provider webhook deduplication.
- Backend production-dependency audit reports five high and 42 moderate
  advisories, so production promotion is blocked.

## Deployment gates

1. Grant/reconnect the GitHub integration with repository write access;
   push this patch to a review branch, not main.
2. Test and promote frontend via Vercel preview after actual browser E2E.
3. **Do not deploy the one-step strict webhook migration directly to
   production.** Render runs migrations before replacing the old API. The old
   controller requires table access that this migration revokes. Split into an
   additive gateway-first release followed by an RLS/revocation release after
   old API instances drain; see the production readiness report.
4. Test tenant isolation, parallel requests, worker retry and payment
   idempotency on disposable tenants before production promotion.
5. Further implementation required: enforced admin MFA with safe
   enrollment, a durable payment-approval email outbox, a monitored
   Render background worker and observability, and landing-page proof.
   These broader audit items are NOT claimed completed.

No production customer data, payment approval, or live database schema
was changed as part of this remediation bundle.

For current blockers, see docs/LEXA_PRODUCTION_READINESS_2026-11-07.md.
