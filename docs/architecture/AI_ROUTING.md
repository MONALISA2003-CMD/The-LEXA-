# LEXA single-service AI redesign

## Decision

Keep the existing Render API service `lexa-backend-api-live` as the single backend service. Its current production compute is Render `1c-2g` (1 vCPU / 2 GB RAM, approximately $25/month). Provider free/developer tiers are an AI-provider routing choice and do not describe the Render hosting plan. Do not create a separate LiteLLM proxy, Python Intelligence web service, private service, or worker during development.

## Runtime path

Vercel frontend → existing NestJS API on Render → native `AiRouterService` → eligible provider API. The backend keeps all API keys. The router uses OpenAI-compatible HTTP endpoints, a provider allowlist, request timeouts, temporary cooldowns and fallback. The current active provider candidates are Gemini free tier, Groq free tier, Cerebras developer/trial access, OpenRouter's `openrouter/free`, and NVIDIA NIM developer API. OpenAI and the second Gemini key are stored for the final production phase but are not used by this build.

## User experience

The frontend presents one LEXA Business Assistant. The user selects an authorised business area (overview, sales, inventory, finance, customers or workforce) and asks a question. It no longer asks the user to choose between a public product guide and a business adviser.

## Security and data handling

The existing NestJS backend performs session, workspace, branch, permission and subscription-entitlement checks before constructing facts. The provider receives only the permitted aggregate subset. Individual customer/employee rows, names, contact details, salaries, credentials, files and document contents are excluded. Models have no tools or database/write permissions. Answers are treated as untrusted text. The usage ledger records request metadata, provider/model, token counts, latency and status, not the prompt or response.

This aggregate-only boundary reduces exposure but does not make a third-party provider equivalent to local processing. Provider data-retention and training terms must be reviewed before production. The paid provider tier stays disabled until production handover.

## Free-tier expectations

Free/developer endpoints are subject to provider-specific rate limits, model changes, account eligibility and trial-credit expiry. The router rotates the first attempt across providers and falls back on timeout, HTTP error or quota response. This improves resilience but cannot guarantee unlimited free use, fixed latency or a provider always being available. Cerebras developer access can stop after promotional credit is exhausted; NVIDIA developer API access is a prototyping entitlement; OpenRouter's `openrouter/free` is rate-limited; Groq Free is rate-limited; Gemini free-tier availability depends on the project and model.

The backend records cost as zero only for the configured free/developer candidate routes. The operator must verify provider account billing modes and disable any provider account that could automatically incur charges. Render hosting is separately billed on the current `1c-2g` compute plan; AI provider free-tier routing does not make the backend service free.

## Current limitations

- Paid OpenAI and paid Gemini routing is deliberately not implemented in this development build, even if their keys are present.
- Document extraction is disabled; the prior Python extraction service is not deployed.
- The NVIDIA model identifier is configurable with `NVIDIA_NIM_MODEL`; the current default is `nvidia/nemotron-3.5-lightning-30b-a3b`.
- A full Nest/Vite build and real provider smoke tests are still release gates.
