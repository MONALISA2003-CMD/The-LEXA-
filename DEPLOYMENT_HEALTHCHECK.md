# Render / Vercel health and release gate

## Application health routes

- `GET /health/live` is process liveness; it should not depend on database availability.
- `GET /health/ready` is readiness; it performs a database query and returns HTTP 503 if the database is unavailable.
- Nest excludes both from the global `/api/v1` prefix. Vercel rewrites the two `/api/v1/health/*` convenience paths directly to the unprefixed Render health routes; the normal `/api/v1/*` API proxy follows them.

## Render API service

Set the existing Render API service health check to exactly `/health/ready`. On 31 October the queried `lexa-backend-api-live` service still had an empty health path. The API service also needs `DATABASE_RUNTIME_ROLE=lexa_app_runtime` after migration `20261030320000_platform_catalog_finance_rls` has been applied successfully to that database.

## Email delivery

Set Render secrets/configuration `RESEND_API_KEY`, `RESEND_FROM_EMAIL` (verified sender domain), and `FRONTEND_PUBLIC_URL`. Verify one real recovery email and one invitation email. The application deliberately returns a clear service-unavailable error while email delivery is unconfigured; it does not silently mark mail as delivered.

## Common commit pinning

Provider metadata observed on 31 October showed:

- `1e6ed1b9589b775e033976dc71ce6c9c8f1174d8`: Render build failed; Vercel deployment in error.
- `51bd9fbaeb1ad5830aecbf055491239e4ce85f45`: Render live; Vercel ready, but this commit predates the ZIP implementation.

The ZIP has not been pushed or deployed. After applying and reviewing it, deploy Render and Vercel from one identical full SHA and capture both successful deployment IDs. This document is not evidence that remote provider settings or deployments have changed.
