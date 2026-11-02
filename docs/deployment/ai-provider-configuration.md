# LEXA AI router — Render configuration

LEXA currently uses **one Render service**: `lexa-backend-api-live`. The NestJS backend contains the AI router and calls provider APIs directly over HTTPS. No separate AI proxy or model gateway is deployed; the provider router runs inside the existing API service.

## Render service

- Service: `lexa-backend-api-live`
- Runtime: Docker
- Dockerfile: `backend/Dockerfile`
- Plan: Free during development
- Region: Frankfurt
- Frontend: remains on Vercel
- Database: existing Neon project

## Environment variable names

Set all credentials in the existing service's Render **Environment** settings. Never place credential values in GitHub, source code, frontend variables, logs, or ZIP files.

| Render key | Purpose |
|---|---|
| `GEMINI_FREE_API_KEY` | Active Google Gemini free-tier route (`gemini-3.5-flash-lite` default model) |
| `GROQ_API_KEY` | Active Groq free-tier route (`openai/gpt-oss-20b` default model) |
| `OPENROUTER_API_KEY` | Active OpenRouter `openrouter/free` route |
| `NVIDIA_NIM_API_KEY` | Active NVIDIA NIM developer/prototyping route |
| `GEMINI_API_KEY` | Stored for a future paid production configuration; not used while `LEXA_AI_PAID_TIER_ENABLED=false` |
| `OPENAI_API_KEY` | Stored for a future paid production configuration; not used while `LEXA_AI_PAID_TIER_ENABLED=false` |

## LEXA feature flags

| Variable | Development value | Meaning |
|---|---:|---|
| `LEXA_AI_ENABLED` | `true` | Enables the native backend router |
| `LEXA_AI_PAID_TIER_ENABLED` | `false` | Prevents use of paid Gemini/OpenAI routes |
| `LEXA_AI_PUBLIC_HELP_CONFIGURED` | `true` | Compatibility flag for earlier clients; no separate public-help pool is deployed |
| `LEXA_AI_BUSINESS_CONFIGURED` | `true` | Compatibility flag; the one assistant serves business-owner workflows through the free/developer provider allowlist |
| `NVIDIA_NIM_MODEL` | `nvidia/nemotron-3.5-lightning-30b-a3b` | Model ID passed to NVIDIA NIM; verify account/model availability during smoke testing |

The two compatibility flags do not create separate assistants or provider pools. The frontend exposes one LEXA Business Assistant. Paid subscription entitlements remain governed by the existing LEXA subscription tables; the separate paid-provider route is disabled.

## Provider and data policy

- The router tries configured free/developer-tier endpoints and falls back when a provider times out, returns an error, or is rate-limited.
- OpenRouter uses `openrouter/free`, not a paid model fallback.
- OpenAI and the second Gemini key are not used while the paid-tier flag is false.
- Only permission-filtered aggregate business facts are included in the provider request. Individual customer/employee records, contact details, salaries, credentials and uploaded documents are excluded.
- Models have no tools, database access, browser, shell or write permissions. They cannot create, post, approve, pay, edit or delete ERP records.
- LEXA stores usage metadata, token counts, provider/model and status—not prompts or answers.
- Provider free-tier quotas, privacy terms and model availability vary by account and may change. NVIDIA developer API access is for prototyping; Groq and OpenRouter free routes have rate limits. A fallback router improves availability but cannot promise unlimited free usage or guaranteed latency.

## Deployment notes

1. Keep the existing Render service and its existing database/storage/email environment variables. Merge AI variables; do not replace the entire environment.
2. No extra Render services are required.
3. Apply the single-service source package to the repository root and deploy the backend/frontend updates.
4. Confirm `/intelligence/status` reports the configured providers and that a real workspace request succeeds.
5. Keep paid-tier routing disabled until billing controls, provider terms, data processing agreements, spending caps and production hosting have been reviewed.


## Free-tier data handling note

The business assistant sends permission-filtered summaries, not raw customer or employee profiles. Google's free Gemini tier may use submitted content to improve Google products; do not route confidential personal records or highly sensitive company information through free endpoints. Provider quotas, model availability and free-tier terms can change.
