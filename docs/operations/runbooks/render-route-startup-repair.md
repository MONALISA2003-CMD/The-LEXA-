# Render startup route collision: inventory lots (2026-11-04)

## Incident

Fastify raised `FST_ERR_DUPLICATED_ROUTE` for `GET /api/v1/workspaces/:workspaceId/branches/:branchId/inventory/lots`. Nest attempted to register it in both `InventoryIntelligenceController.lots()` (complete lot register) and `CatalogInventoryController.availableLots()` (checkout-filtered lots). Compilation and unit tests did not initialize the Fastify route table and could not catch the runtime conflict.

## Fix and API compatibility

* Retain `GET /api/v1/workspaces/{workspaceId}/branches/{branchId}/inventory/lots` for the complete inventory-lot register (existing inventory intelligence contract).
* Move **checkout's filtered lookup** to `GET /api/v1/workspaces/{workspaceId}/branches/{branchId}/inventory/lots/available?productId={uuid}&variantId={uuid}`; productId is required, variantId optional. This endpoint returns only available, unexpired lots from the authenticated tenant/branch.
* Retain `POST /api/v1/workspaces/{workspaceId}/branches/{branchId}/inventory/lots` for lot creation and `GET /inventory/lots/{lotId}/history` for lot history.
* The checkout frontend API client and the OpenAPI contract have been updated together.

The frontend and backend must be deployed together: older frontend bundles that still request GET `/inventory/lots?productId=...` expect a checkout availability array but now receive the inventory register. Avoid a long period of version skew. An alternative, for a future compatibility release, is an explicitly versioned checkout endpoint with a migration window.

## Prevent recurrence

`npm run build` now runs `node scripts/check-route-uniqueness.mjs` *before compilation*. It parses all NestJS controller decorators using the TypeScript compiler API and rejects duplicate HTTP verb + canonical Fastify path (including param-label aliases). The OpenAPI checker independently reports duplicate source declarations instead of silently merging them into a set. The `route-uniqueness.test.mjs` test exercises the collision detector and the inventory/checkout URL split.

## Verify before production

From the repository root, after installing dependencies:

```bash
cd backend
npm ci
npx prisma generate
npm test
npm run contract:check
npm run build
cd ../lexa-frontend
npm ci
npm run build
```

If package-lock files are absent in a clean ZIP, `scripts/clean_repository.py` generates them during the repository-import GitHub Actions workflow; the workflow then runs the test/build stages above. For a Docker build, run `docker build -f backend/Dockerfile .` with access to the npm registry.

On Render, use a readiness probe on **`/health/ready`**, which tests the DB and returns non-2xx if unavailable. The blueprint now specifies `healthCheckPath: /health/ready`; ensure the live service settings are synchronized with the blueprint. Check that Render's deployed commit matches the validated source commit (not just the ZIP upload commit). After deploy, `GET /health/live` and `GET /health/ready` should both return HTTP 200; no login is required for those probes. Validate the authenticated inventory register and checkout availability endpoints with a staging tenant before redirecting live traffic.

If Render still fails, inspect *the first new error* after updating to the new source commit; do not repeatedly redeploy the old source or bypass Fastify's duplicate-route protection. Do not paste production secrets or customer records into incident logs.
