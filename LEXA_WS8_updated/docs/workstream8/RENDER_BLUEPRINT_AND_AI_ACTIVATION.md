# Workstream 8 — Render Blueprint and AI activation

## What the Blueprint provisions

- `lexa-ai-provider-keys`: an initially empty Render environment-variable group.
- `lexa-litellm`: private Docker service on the `starter` plan in Frankfurt. It receives the provider group and a Render-generated `LITELLM_MASTER_KEY`.
- `lexa-intelligence`: private Docker/FastAPI service on the `starter` plan in Frankfurt. It receives the gateway host/key and a Render-generated `LEXA_INTELLIGENCE_INTERNAL_TOKEN` through private `fromService` references.
- `lexa-backend-api-live`: the existing web service is adopted by exact name and wired to the private intelligence service. It is not meant to be created as a duplicate.

The two additional private services are billable Render resources. Review workspace plan and service limits before syncing.

## First sync and credentials

1. Commit this non-secret Blueprint and the related Workstream 8 source files to the LEXA repository.
2. In Render, create/sync the Blueprint from that repository and review the proposed resources. Confirm the existing `lexa-backend-api-live` is shown as an existing resource, not a duplicate.
3. After the sync creates `lexa-ai-provider-keys`, open Render → Environment Groups → `lexa-ai-provider-keys` and add provider credentials there. The group is deliberately empty in source: do not add `sync: false` entries inside a group, because Render ignores those placeholders.
4. Add only variable names and values in Render. Never commit provider keys, generated internal tokens, `.env` files, or secret-bearing screenshots into Git or ZIP archives.
5. The expected provider variable names are in `WORKSTREAM8_RENDER_KEYS_20261101.md`. In particular, LiteLLM's NVIDIA NIM provider expects `NVIDIA_NIM_API_KEY` (not `NVIDIA_API_KEY`).
6. The public-help pool is only for generic published LEXA product guidance. Paid Gemini/OpenAI are reserved for permission-filtered business aggregates. Never use free/community providers for tenant, customer, financial or HR facts.

## Safe readiness order

Both flags begin false on `lexa-intelligence`:

- `LEXA_AI_PUBLIC_HELP_CONFIGURED=false`
- `LEXA_AI_BUSINESS_CONFIGURED=false`

Keep them false until the following tests pass:

- Gateway `/models` returns `lexa-public-help`, and a generic product-help smoke test succeeds. Then, and only then, set `LEXA_AI_PUBLIC_HELP_CONFIGURED=true`.
- Gateway `/models` returns `lexa-business-paid`, and a branch-scoped business explanation succeeds through the paid-only pool. Then, and only then, set `LEXA_AI_BUSINESS_CONFIGURED=true`.

The backend's `LEXA_INTELLIGENCE_ENABLED=true` flag merely permits the backend to consult the optional service. It does not mean that either model pool is ready. The backend checks the intelligence `/health/ready` endpoint at runtime. If either service or a model provider fails, core LEXA workflows must continue to operate.

## Frontend behaviour

The frontend includes the LEXA Intelligence page at `/intelligence`, a dashboard Quick Access entry, and navigation in the application shell. It calls the LEXA backend; provider credentials and internal service tokens are never exposed in the browser bundle. The page displays availability based on the backend readiness endpoint and workspace entitlements. If a pool is not ready, the UI remains unavailable for that mode rather than simulating answers.

A successful frontend response requires all of the following: the backend deployment is healthy, the Workstream 8 migration is applied, the two private services are healthy, the matching readiness flag is true, the relevant workspace plan/role permits the request, and the frontend deployment contains the Intelligence route.

## Performance expectations

Multiple providers improve resilience and give LiteLLM alternate deployments to try, but they do not guarantee faster responses. Provider free tiers have changing rate limits, queues, model availability and data terms. LiteLLM keeps `simple-shuffle` routing because it is the low-overhead production default; errors are retried within the same permitted pool, never across public and business pools. Measure request latency and error rates before changing routing weights or timeouts.
