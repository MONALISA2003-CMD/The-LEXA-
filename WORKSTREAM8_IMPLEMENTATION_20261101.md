# Workstream 8 — Reporting, SaaS controls & LEXA Intelligence

**Scope:** first read-only implementation slice. Backend, frontend, optional Python services and Render deployment blueprint.

## Delivered

### Authoritative reports

`GET /workspaces/:workspaceId/branches/:branchId/reports/authoritative` calculates report facts from the sales and return records, payment/receipt allocations, stock movements and current product cost prices, issued AR invoices and receipt allocations, approved AP invoices and payment allocations, posted GL journals and accounts, CRM module identity counts, and (with separate entitlement and permission) aggregate HR headcount/attendance. It does not query generic module JSON amount fields.

Sales, return and revenue/expense figures are selected-period flows. Stock, AR/AP outstanding balances, GL control balances and trial-balance checks are current snapshots. Inventory valuation is an indicative current-quantity-times-current-cost measure, not FIFO or historical cost-layer accounting. Source notes are displayed in the frontend so snapshots are not misrepresented as historical balances.

Finance numbers require `finance.read`; CRM and HR counts require the advanced analytics plan feature plus `crm.read` or `people.read`. No names, contact data, payroll, salary or employee-level details are included.

### SaaS controls

The additive `20261101180000_workstream8_saas_ai_reporting` migration adds the Starter, Growth, Professional and Enterprise plan catalogues, feature entitlements, tenant subscription rows, time-limited audited feature overrides, usage counters, AI request audit events and support diagnostics access audit. Existing tenants are grandfathered into the smallest plan that fits current active seats/branches. New tenants receive Starter through a narrowly scoped database trigger.

Tenant subscription rows are locked while reserving AI usage. Branch and active membership caps are checked in database triggers as well as API logic, so parallel requests cannot race past plan ceilings. AI use is metered by request count and reserved/settled micros. LEXA never logs prompt, answer, document text or uploaded contents in the usage tables.

The seeded plans are initial entitlement tiers, not a payment/checkout implementation. Online plan billing, automated subscription renewal and self-service upgrade checkout are not in this slice.

### LEXA Business Assistant — single-service router

The development deployment uses a native TypeScript provider router inside the existing NestJS backend. It does not require a separate LiteLLM proxy or Python web service, so Render remains at one service during this phase.

- One assistant serves business-owner workflows; the frontend no longer presents separate public-help and business-AI modes.
- Free/developer-tier provider routes are attempted with automatic fallback: Google Gemini free tier, Groq free tier, Cerebras developer/trial access, OpenRouter `openrouter/free`, and NVIDIA NIM developer API access.
- The OpenAI key and second Gemini key are stored on the existing Render service for the future production phase but are not used while `LEXA_AI_PAID_TIER_ENABLED=false`.
- Provider requests are made server-side. The browser never receives provider credentials.
- The backend checks tenant/branch membership, permissions, plan entitlement and usage reservations before a request. Only permission-filtered aggregate facts are included; individual customer/employee records, contact details, salaries, credentials and uploaded documents are excluded.
- Models have no tools, database access, browser, shell, email, payment, approval or write authority. Model output is untrusted text and cannot post or change ERP records.
- LEXA records usage metadata and provider/model identifiers, not prompts or answers. Free-route cost is recorded as zero; provider-specific account terms and trial quotas still apply.
- Document extraction is intentionally unavailable in this single-service development phase. It can be added later without creating a second Render service, or moved to a production worker when budget permits.

Provider availability and rate limits vary by account. The router tries another configured provider when one times out, rejects a request or reaches a quota. This improves resilience but does not guarantee unlimited free requests or fixed response latency. The paid provider route remains disabled until the final production phase.

Prompt-injection screening is not represented as perfect detection. The security boundary is least privilege and lack of action authority: untrusted model output cannot call ERP tools or write data.

### Python capability profiles

The lightweight service image includes FastAPI, Pydantic, HTTPX, PyMuPDF and Office/CSV parsers. Optional separate profiles add Polars, DuckDB, NumPy, pandas, SciPy, scikit-learn, statsmodels, PyArrow, Docling, Unstructured, RapidFuzz, PaddleOCR, EasyOCR, Tesseract, OpenCV, Presidio, spaCy, Dramatiq and Redis. These large dependencies are intentionally not all installed in the small HTTP API image. The future heavy-work worker can install the profiles it needs without risking core LEXA availability.

## Render variables and keys

All AI variables are configured on the existing `lexa-backend-api-live` service. The updated `render.yaml` defines that single service only; it does not create LiteLLM, Intelligence, worker or other paid services. The required key names and activation policy are documented in `WORKSTREAM8_RENDER_KEYS_20261101.md`. `LEXA_AI_PAID_TIER_ENABLED=false` keeps OpenAI and the paid Gemini key dormant. The two requested `LEXA_AI_PUBLIC_HELP_CONFIGURED` and `LEXA_AI_BUSINESS_CONFIGURED` flags are retained as compatibility markers; they do not create separate model pools.

The older Python/LiteLLM source remains in the repository as a future reference, but it is not part of the current Render deployment. Do not sync its previous multi-service Blueprint.

## Validation completed in the repair workspace

- Backend Node regression suite: **80 passed, 0 failed**.
- Python intelligence suite: **12 passed, 0 failed** (including dynamic provider-pool isolation and optional Hugging Face gating).
- Python compile check: passed.
- Render single-service YAML parsing: passed; legacy LiteLLM configuration remains in the repository but is not deployed.
- Backup inventory: **161 table decisions / 144 discovered schema and migration references**.
- OpenAPI coverage: **296 operations across 235 routes**, exact match.
- Route adapter coverage: **17/17**.
- Ledger coverage: **9 source workflows**.
- Frontend prebuild scripts: previously executed successfully; source TypeScript/TSX transpilation is rerun in the handoff validation. Report screens now link directly into a prefilled Business Adviser question.

## Not yet proven / not deployed

The full Vite `tsc -b && vite build`, full Nest dependency-backed build, native provider smoke tests, authenticated cross-tenant HTTP tests, actual Resend/provider integration tests, OCR and heavy worker profiles are not run here. The legacy Python service is not deployed in this phase. `backend/node_modules` and `lexa-frontend/node_modules` are not installed in this repair workspace. The updated code should not be described as deployed or hosted-green until Vercel and Render deploy it and health checks pass.

The Workstream 8 migration is additive and remains pending deployment. Do not roll back the already applied Workstream 7 migrations.
