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

### LEXA Intelligence

The optional FastAPI service sits behind private service networking and a LiteLLM gateway. It is not a dependency of the Nest API and has no ability to perform core ERP operations.

- **LEXA Guide:** generic product guidance only; free/community pool. No tenant report or document data is included. Current Gemini free, Groq, Cerebras, OpenRouter `:free`, NVIDIA NIM and optional Hugging Face deployments are filtered from actual configured keys at startup.
- **Business Adviser:** paid Gemini API and OpenAI pool only; receives permission-filtered aggregate facts, not raw records. Public and paid pools never cross-fallback.
- **Document extraction:** PDF, DOCX, XLSX, PPTX, CSV and text-like formats are extracted locally with size, archive expansion and output caps. Content is not submitted to an LLM or used to change records.
- **No AI write tools:** no model-accessible database, browser, shell, email, payment, approval or write tools exist. Future writes require preview, explicit confirmation, a second backend authorization check and a durable audit trail.

Prompt-injection screening is not represented as perfect detection. The security boundary is least privilege and lack of action authority: untrusted model output cannot call ERP tools or write data.

### Python capability profiles

The lightweight service image includes FastAPI, Pydantic, HTTPX, PyMuPDF and Office/CSV parsers. Optional separate profiles add Polars, DuckDB, NumPy, pandas, SciPy, scikit-learn, statsmodels, PyArrow, Docling, Unstructured, RapidFuzz, PaddleOCR, EasyOCR, Tesseract, OpenCV, Presidio, spaCy, Dramatiq and Redis. These large dependencies are intentionally not all installed in the small HTTP API image. The future heavy-work worker can install the profiles it needs without risking core LEXA availability.

## Render variables and keys

The Blueprint creates an empty `lexa-ai-provider-keys` group and attaches it to `lexa-litellm`; add `GEMINI_FREE_API_KEY`, `GROQ_API_KEY`, `CEREBRAS_API_KEY`, `OPENROUTER_API_KEY`, `NVIDIA_NIM_API_KEY`, `GEMINI_API_KEY`, `OPENAI_API_KEY`, and optional `HF_TOKEN` in Render after first sync. `sync: false` is not valid inside an environment group. Render generates `LITELLM_MASTER_KEY` and `LEXA_INTELLIGENCE_INTERNAL_TOKEN`, then privately references them between services. Set `LEXA_AI_PUBLIC_HELP_CONFIGURED=true` or `LEXA_AI_BUSINESS_CONFIGURED=true` only after the relevant aliases are actually available on the private LiteLLM gateway. HF remains opt-in.

The Blueprint adopts the existing `lexa-backend-api-live` service and adds two private Starter services (`lexa-litellm`, `lexa-intelligence`) in Frankfurt. These two additional private services are billable Render resources; confirm plan cost before Blueprint sync. The corrected Blueprint has not been synced, no new Render services have been created, and no third-party secret has been entered. The current Vercel `lexa_review` production deployment for commit `68d48284ac8231a1a69ded9bd31434ab2e0f96cb` reports `lint_or_type_error`; the Intelligence frontend route exists in source, but live responses are not enabled until backend services and frontend build are healthy.

## Validation completed in the repair workspace

- Backend Node regression suite: **80 passed, 0 failed**.
- Python intelligence suite: **13 passed, 0 failed** (including dynamic provider-pool isolation, NVIDIA NIM public-pool routing, and NVIDIA NIM public-pool routing, and optional Hugging Face gating).
- Python compile check: passed.
- Render and LiteLLM YAML parsing: passed.
- Backup inventory: **161 table decisions / 144 discovered schema and migration references**.
- OpenAPI coverage: **296 operations across 235 routes**, exact match.
- Route adapter coverage: **17/17**.
- Ledger coverage: **9 source workflows**.
- Frontend prebuild scripts: previously executed successfully; source TypeScript/TSX transpilation is rerun in the handoff validation. Report screens now link directly into a prefilled Business Adviser question.

## Not yet proven / not deployed

The full Vite `tsc -b && vite build`, full Nest dependency-backed build, live Python container boot, LiteLLM provider calls, authenticated cross-tenant HTTP tests, migration execution on staging, production migration, actual Resend/provider integration tests, OCR and heavy worker profiles are not run here. `backend/node_modules` and `lexa-frontend/node_modules` are not installed in this repair workspace. The updated code should not be described as deployed or hosted-green until Vercel and Render deploy it and health checks pass.

The Workstream 8 migration is additive and remains pending deployment. Do not roll back the already applied Workstream 7 migrations.
