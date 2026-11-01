# LEXA Intelligence service

LEXA Intelligence is an optional, isolated Python service. It is not imported by the NestJS API and does not own a database transaction. An outage, timeout, missing key, exhausted provider allowance or failed model call must not stop sales, inventory, accounting, HR or any other core LEXA workflow.

## Release shape

- `app/`: FastAPI boundary, deterministic report analysis and local document text extraction.
- `litellm/`: private provider gateway, allowlisted aliases and dynamic provider deployment filtering.
- `requirements.txt`: lightweight API runtime only.
- `requirements-analytics.txt`: optional Polars, DuckDB, NumPy, pandas, SciPy, scikit-learn, statsmodels and Arrow tools for future analytical jobs.
- `requirements-document-ai.txt`: optional Docling and Unstructured parsers plus fuzzy matching.
- `requirements-ocr.txt`: optional PaddleOCR, EasyOCR, Tesseract integration and image handling. OCR dependencies are large and should run on a separately sized worker.
- `requirements-queue.txt`: optional Dramatiq and Redis for asynchronous heavy work.
- `requirements-redaction.txt`: optional Presidio, phone-number parsing and spaCy for a future, separately validated redaction pipeline.

The optional profiles are not installed in the small HTTP API image. They are capability packages for the next worker slice; the current extraction path uses PyMuPDF, python-docx, openpyxl and python-pptx, with a 5 MiB upload limit, archive expansion checks and a 120,000-character extraction limit. OCR is not silently attempted on this web process.

## Two provider pools — never cross-fallback

| Alias | Permitted content | Configured providers |
|---|---|---|
| `lexa-public-help` | Generic, published LEXA product guidance only; no tenant records | Gemini free project key, Groq, Cerebras, OpenRouter `:free`; optional Hugging Face when explicitly enabled |
| `lexa-business-paid` | Permission-filtered aggregates read from LEXA operational and posted-ledger tables | Paid Gemini API and OpenAI |

The public alias contains only free/community or explicitly opted-in provider deployments. The OpenRouter candidate is a `:free` model and has no paid fallback. A public-help error never falls through into the paid business pool. A business explanation can never fall back into a public/free model. Hugging Face is disabled by default because free-account inference credits are not a production guarantee.

Current candidate model IDs are versioned in `litellm/config.yaml`. Providers can change free quotas, supported model IDs, latency and data policies without notice. Keep request volume low, check the provider console for account-specific quotas and monitor the LEXA tenant meter. Do not promise uninterrupted free inference.

## Data classification and safety boundary

- Public product help receives only the question and this source-controlled LEXA product guide. It does not receive the current tenant's report, file, customer data or HR data. Users are warned not to enter private or business-specific facts in this mode.
- Business Adviser receives a server-built, scope-filtered subset of branch aggregates. The backend checks the user's LEXA permissions before building those facts. CRM/HR content is aggregate-only and requires advanced entitlement plus the relevant permission. Names, contact details, salary, payroll, employee records and customer rows are not passed to the model.
- Reports themselves use typed operational and posted-ledger records. Generic `module_records.data.amount` values are not treated as money.
- Documents are extracted locally and returned to the user for review. The document contents are not sent to an LLM, persisted by this service, or used to alter LEXA records.
- No model tools are registered. The model has no database, browser, file system, shell, payment, approval or write action. Prompt screening is defence-in-depth, not a promise that prompt injection can be perfectly detected. The decisive control is that the model has no authority to perform actions.
- All extraction output and model answers are untrusted text; the frontend renders them as text, never as HTML.

A later write-capable AI feature must be a separate implementation with a typed action preview, clear target and before/after values, explicit user confirmation, a second backend permission check at execution time, idempotency and a full audit trail. `intelligence.write_actions` is hard-disabled in this release.

## Tenant quotas and spend

LEXA reserves a request against the tenant's current subscription row inside a database transaction before it calls the optional service. The tenant row lock serializes concurrent requests. The database stores counts, data class, alias, token counts, provider/model metadata, status and cost micros—never the prompt, answer, uploaded file or document text. Successful LLM calls settle to LiteLLM's `x-litellm-response-cost` header. Failed attempts retain the reservation so repeated errors cannot bypass request quotas.

The first release uses a fixed $0.05 reservation per AI request, with bounded prompt, facts and output sizes. Model aliases and provider candidates are intentionally constrained. Review provider prices before adding a more expensive model or increasing output limits; a change to those limits requires revisiting the reservation amount and plan budgets.

Plan catalogue and monthly budgets are enforced in LEXA. The four initial plans are seeded by the Workstream 8 migration. Seat and branch caps are enforced in database triggers as well as API logic. Online subscription billing, plan checkout and automatic renewals are not included.

## Required configuration

Render Blueprint creates a private LiteLLM service and a private FastAPI intelligence service, generates their internal master/authentication tokens, and connects them to the existing LEXA API using private service references. No provider key is committed to Git.

Add these provider keys in Render when prompted:

- `GEMINI_FREE_API_KEY` — a Google AI Studio project/key intended for public product-help traffic.
- `GROQ_API_KEY` — Groq inference account.
- `CEREBRAS_API_KEY` — Cerebras inference account.
- `OPENROUTER_API_KEY` — OpenRouter account; LEXA selects a `:free` model only for public help.
- `GEMINI_API_KEY` — paid Gemini API project/key for confidential aggregate summaries.
- `OPENAI_API_KEY` — paid OpenAI API key for confidential aggregate summaries.
- `HF_TOKEN` — optional; only used after `LEXA_AI_HF_ENABLED=true` and a billing/credit check.

The blueprint generates `LITELLM_MASTER_KEY` and `LEXA_INTELLIGENCE_INTERNAL_TOKEN`; `fromService` references pass these privately to the dependent services. Do not paste these generated service tokens into the source repository.

After provider keys are added and the corresponding aliases appear in the LiteLLM `/models` list, set `LEXA_AI_PUBLIC_HELP_CONFIGURED=true` and/or `LEXA_AI_BUSINESS_CONFIGURED=true` on `lexa-intelligence`. Leave a pool false until it has been validated. `LEXA_INTELLIGENCE_ENABLED` is wired on the existing API by the Blueprint; missing provider credentials still leave the model functionality unavailable, not the ERP.

## Health and operations

- `GET /health/live`: liveness only.
- `GET /health/ready`: internal-token protected readiness; reports whether each alias is configured.
- `POST /v1/help`: approved LEXA product-help pool only.
- `POST /v1/explain`: paid business pool only, strict aggregate schema.
- `POST /v1/extract`: local document extraction only.

The Render Blueprint provisions two additional private services on the `starter` plan in Frankfurt. They are separate billable Render resources. Review the current Render pricing and your workspace's limits before syncing the Blueprint. The Blueprint is included in source; it has not been synced or deployed by this workstream.
