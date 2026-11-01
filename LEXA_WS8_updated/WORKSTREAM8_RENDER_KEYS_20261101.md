# Workstream 8 — Render setup keys

This is the key list for the Workstream 8 Blueprint in `render.yaml`. **Never commit values to Git or a ZIP.** The Blueprint creates `lexa-ai-provider-keys` as an empty group and links it to `lexa-litellm`. After the first sync, add the keys and values in Render's Environment Groups page. `sync: false` is not valid inside an environment-variable group and will not create populated entries.

## Third-party keys you obtain

| Render environment key | Provider | What it enables | Policy |
|---|---|---|---|
| `GEMINI_FREE_API_KEY` | Google AI Studio / Gemini API | Public LEXA Guide candidate | Use a Free-tier project/key. Product guidance only; free-tier data terms may permit model improvement. |
| `GROQ_API_KEY` | Groq | Fast public LEXA Guide candidate models | Provider quota and model availability are account-dependent. |
| `CEREBRAS_API_KEY` | Cerebras Inference | Fast public LEXA Guide candidate models | Provider quota and model availability are account-dependent. |
| `OPENROUTER_API_KEY` | OpenRouter | Public LEXA Guide `:free` model only | LEXA does not configure a paid fallback in this pool. Free limits are tight and can change. |
| `NVIDIA_NIM_API_KEY` | NVIDIA NIM | Public LEXA Guide candidate | LiteLLM requires this exact key name; it is never used for tenant aggregates. |
| `GEMINI_API_KEY` | Google AI Studio / Gemini API | Paid LEXA Business Adviser candidate | Use a billing-enabled paid API project. |
| `OPENAI_API_KEY` | OpenAI API | Paid LEXA Business Adviser candidate | Add API billing/usage limits in OpenAI separately. |
| `HF_TOKEN` | Hugging Face | Optional public-help candidate | Not treated as a guaranteed free provider; keep disabled until credits/billing and provider policy are checked. |

You do not need every provider to start. At least one configured public provider plus `LEXA_AI_PUBLIC_HELP_CONFIGURED=true` enables product-only help. At least one paid Gemini/OpenAI provider plus `LEXA_AI_BUSINESS_CONFIGURED=true` enables aggregate business explanations. The startup script includes only deployments whose exact provider key is present.

## Render-generated internal secrets — do not obtain manually

Render generates these in the Blueprint:

- `LITELLM_MASTER_KEY`: protects the private LiteLLM gateway.
- `LEXA_INTELLIGENCE_INTERNAL_TOKEN`: authenticates the private FastAPI service.

The Blueprint uses `fromService` references to pass them over Render's private network. Do not copy them into Git or the browser bundle.

## Service configuration

| Variable | Service | Initial value / action |
|---|---|---|
| `LEXA_INTELLIGENCE_ENABLED` | Existing `lexa-backend-api-live` | Blueprint sets `true`; AI still fails closed until its health/readiness checks pass. |
| `LEXA_INTELLIGENCE_BASE_URL` | Existing backend | Render private `hostport` reference to `lexa-intelligence`. |
| `LEXA_INTELLIGENCE_INTERNAL_TOKEN` | Existing backend | Private `fromService` reference; do not set a literal. |
| `LEXA_AI_BUSINESS_MODEL_ALIAS` | Existing backend | `lexa-business-paid`; keep this alias unchanged unless policy and tests are updated. |
| `LEXA_AI_BUSINESS_CONFIGURED` | `lexa-intelligence` | Keep `false` until LiteLLM lists `lexa-business-paid` and a paid provider call is validated. |
| `LEXA_AI_PUBLIC_HELP_CONFIGURED` | `lexa-intelligence` | Keep `false` until LiteLLM lists `lexa-public-help` and a product-only question is validated. |
| `LEXA_AI_HF_ENABLED` | `lexa-litellm` | `false`; opt in only after checking Hugging Face credits and retention policy. |
| `LITELLM_BASE_URL`, `LITELLM_API_KEY`, `LITELLM_PUBLIC_HELP_API_KEY` | `lexa-intelligence` | Private `fromService` references to LiteLLM host and generated master key. |

## Safe activation order

1. Review the two private `starter` Render services in `render.yaml`. They are additional billable services. Check current Render pricing and workspace capacity before syncing.
2. Sync the Blueprint. It creates two private services and an empty provider key group. The services start safely with no provider keys, and both AI readiness flags start `false`.
3. Open Render → Environment Groups → `lexa-ai-provider-keys`; add the variable names and values listed above. Never add them to the backend service or frontend.
4. Confirm `lexa-litellm` and `lexa-intelligence` are healthy and that the API reaches `lexa-intelligence` over Render's private network.
5. Check the private LiteLLM `/models` response from the intelligence service network. The required alias must actually exist; a configured environment flag alone is not proof.
6. Set `LEXA_AI_PUBLIC_HELP_CONFIGURED=true` only after `lexa-public-help` appears and a generic LEXA product question succeeds. Confirm private business questions are rejected by public-help policy.
7. Set `LEXA_AI_BUSINESS_CONFIGURED=true` only after `lexa-business-paid` appears and a branch-scoped report explanation succeeds. Confirm usage/cost metadata is recorded in LEXA. Never route confidential aggregates to the free/public pool.
8. Keep the Workstream 8 migration additive. Let the API deploy complete before applying pending migrations through the reviewed Render startup path. Do not roll back the Workstream 7 migrations already applied to Neon.

## What this does not do automatically

- It does not buy credits, link provider billing accounts, or guarantee a provider's advertised free quota.
- It does not perform OpenAI/Google account setup for you.
- It does not enable a model alias merely because an API key exists; the private gateway readiness check must confirm the alias.
- It does not expose provider keys to the frontend or grant models tools to write LEXA records.
- It does not change live Render service variables until you sync the Blueprint and enter the required keys.
