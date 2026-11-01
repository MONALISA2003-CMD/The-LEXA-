# LEXA Backend Architecture Lock

**Status:** LOCKED BASELINE — v1.0  
**Date:** 2026-10-29  
**Applies to:** LEXA ERP / SaaS platform  
**Purpose:** The authoritative backend architecture and implementation rules for LEXA. Use this document as the baseline when scaffolding, integrating, reviewing, or deploying backend services.

> **Lock meaning:** These are the default architecture decisions. Do not silently replace the stack, introduce a competing source of truth, expose provider keys in the browser, or bypass the security and data-integrity rules. A material change requires a short Architecture Decision Record (ADR) explaining the reason, migration impact, security impact, and cost/operational trade-offs.

---

## 1. Executive decision

Build LEXA as a **multi-tenant SaaS ERP, implemented first as a modular monolith with separately deployable background workers and a provider-independent AI gateway**.

The design must deliver:

- One authoritative PostgreSQL database for business records.
- Explicit tenant isolation and server-enforced permissions on every business operation.
- A versioned REST API described by OpenAPI and aligned to the existing frontend contract.
- A modern SaaS foundation: organizations, branches, memberships, roles, entitlements, metering, audit, notifications, webhooks, exports, and operations controls.
- A central AI orchestration layer able to route tasks across **free-tier and paid providers**, enforce privacy and budgets, and fail over safely.
- Deterministic business logic for money, inventory, permissions, taxes, and reporting calculations; AI may explain or recommend but is not the system of record.
- Automated tests, migrations, observability, and deployment gates before production changes.

## 2. Locked technology choices

| Concern | Locked decision | Implementation note |
|---|---|---|
| Backend language/runtime | TypeScript on the current supported Node.js LTS | Pin the runtime and package-manager versions in the repository. |
| API framework | NestJS with the Fastify adapter | Organize by domain modules; keep controllers thin and business rules in application/domain services. |
| API style | REST under `/api/v1` | OpenAPI contract first; consistent pagination, filtering, validation and error responses. |
| API contract | Existing `openapi/backend-contract.yaml` is the integration baseline | Do not silently break or replace it. Change it deliberately and keep frontend clients/tests aligned. |
| Database | Neon PostgreSQL | The authoritative source of truth for ERP and SaaS business data. |
| ORM and migrations | Prisma | Review SQL migrations; use `prisma migrate deploy` for release/production migration execution, not `migrate dev`. |
| Identity | Supabase Auth, if retained in the existing project | Use it for identity and sessions; verify access tokens in the API. Do not use a frontend-supplied user or tenant ID as proof of authorization. |
| Authorization | Server-side tenant-aware RBAC and resource-level checks | Permissions must be enforced by backend services for every read and write. PostgreSQL RLS can be added as defense-in-depth where connection design supports it. |
| Background work | Redis + BullMQ | Separate worker process for AI jobs, imports/exports, notifications, scheduled tasks and other retryable work. |
| Multi-provider AI gateway | LiteLLM Proxy, behind a LEXA-owned AI orchestration module | Centralize provider credentials, model routing, bounded retries/fallbacks and cost controls. Keep LEXA-specific policy and metering in LEXA's own backend. |
| AI provider integration | Provider/model registry and task profiles | Support free and paid providers without hard-coding a provider into business modules. Check actual model capabilities before routing. |
| File storage | S3-compatible object storage, recommended Cloudflare R2 | Store documents, attachments, imports and exports outside the application container. Keep private files private and issue time-limited download URLs. |
| Search and retrieval | PostgreSQL full-text search first; `pgvector` when semantic retrieval is required | Retrieval must enforce tenant and user permissions before content is passed to a model. |
| Observability | OpenTelemetry plus Sentry or equivalent | Structured logs, traces, error reporting, health checks and operational metrics. Avoid logging secrets or raw sensitive prompts. |
| Deployment | Keep the frontend on Vercel; deploy API and worker as separately configured services (Render is the current deployment candidate) | Services may share a codebase initially but have separate processes, health checks, environment settings and scaling. |
| CI/CD | GitHub Actions or the existing approved pipeline | Run lint, type checks, tests, OpenAPI checks, production build and migration validation before release. Never commit credentials. |

### Single-source-of-truth rule

- **Neon PostgreSQL owns business data.** Do not split core ERP records between Neon and the Supabase database.
- Supabase Auth owns identity only unless a deliberate ADR changes this boundary.
- LiteLLM routes model requests; it is not LEXA's authoritative tenant-usage ledger.
- Object storage holds file bytes; PostgreSQL holds their metadata, ownership, permissions and lifecycle status.
- The existing frontend remains in place. Backend work is additive and must not trigger an unnecessary frontend rewrite or project-structure reorganization.

## 3. Deployment shape

```text
Browser / LEXA frontend (Vercel)
          |
          | HTTPS /api/v1
          v
LEXA API (NestJS + Fastify) ---------------------> Neon PostgreSQL
          |                                                |
          |                                                +-- business records
          |                                                +-- tenant / SaaS records
          |                                                +-- audit and usage records
          |
          +---- Redis / BullMQ ----> LEXA worker process
          |                              +-- imports / exports
          |                              +-- notifications / schedules
          |                              +-- long-running AI and document jobs
          |
          +---- LEXA AI orchestration ----> LiteLLM gateway
                                             |
                                             +-- eligible free-tier providers
                                             +-- approved paid providers
                                             +-- optional approved self-hosted models

Private S3-compatible storage <---- file metadata and authorization in PostgreSQL
```

The initial deployment is **not** a fleet of microservices. Keep the domain code modular and deploy the API and worker separately only where the operational role differs. Split additional services only when measured load, isolation, compliance, or team ownership justifies it.

## 4. Required backend modules

Each module owns its business rules and data access. A module must not write directly into another module's tables to bypass that module's service or invariants.

1. **Identity and access:** user profile, sessions, organizations, memberships, invitations, roles, permissions, MFA-related policy, password recovery integration.
2. **Tenancy and organization structure:** tenant, organization settings, branches, locations, data-retention and regional settings.
3. **SaaS administration:** subscription reference, plans, entitlements, feature flags, quotas, trials, usage metering and plan enforcement. Payment processor selection remains behind an adapter until business markets and settlement requirements are confirmed.
4. **Catalog:** products/services, units, categories, variants, pricing and tax configuration.
5. **Customers and suppliers:** contacts, addresses, terms, account status and authorized contact data.
6. **Sales:** quotes, orders, invoices, payments, returns and credit notes.
7. **Inventory:** warehouses, stock movements, transfers, reservations, adjustments, reorder rules and valuation.
8. **Procurement:** purchase requests, approval, purchase orders, receiving and supplier bills.
9. **Finance:** expenses, receivables, payables, journal/ledger entries and reconciliations. Accounting rules must be deterministic and reviewable.
10. **Reports and analytics:** permission-aware aggregates and reproducible report definitions; calculations are performed by code/database queries, not invented by a model.
11. **Workflow and approvals:** tasks, approval policies, status transitions and human confirmation for sensitive operations.
12. **Inbox and notifications:** in-app messages, email/SMS/push provider adapters, delivery status and retry records.
13. **Files and document processing:** upload policy, malware/content checks where applicable, metadata, extraction jobs and retention.
14. **Search:** filters, full-text search and scoped retrieval.
15. **Integrations and webhooks:** external connections, signature verification, idempotent inbound events, retry policy and delivery history.
16. **Audit and compliance:** append-only audit events for sensitive business and administrative actions; export and retention tooling.
17. **AI platform:** provider registry, routing, prompt/version management, retrieval, tool registry, safety rules, usage events, evaluations and tenant AI preferences.
18. **Platform operations:** health/readiness checks, system configuration, incident visibility, feature flags and controlled administration.

### Module pattern

Use this default flow:

`HTTP controller -> DTO validation / authorization -> application service -> domain rules -> repository / Prisma -> PostgreSQL`

Controllers handle HTTP concerns only. Business rules belong in services/domain code. External providers are called through adapters. Cross-module actions must use documented service interfaces and transactions/events rather than hidden direct writes.

## 5. Multi-tenant security lock

Tenant separation is a release-blocking security requirement, not a later optimization.

- Every tenant-owned record must include a non-null `tenant_id` (or a documented equivalent for an existing schema) and appropriate indexes.
- The authenticated user, tenant membership, active organization, branch scope and permission are derived and validated server-side.
- Never trust a tenant ID, role, amount, owner ID, price, tax, payment status or stock count simply because the frontend or AI supplied it.
- Every query and mutation must be scoped by authorized tenant and applicable branch/resource permissions. Add composite uniqueness/foreign-key constraints where needed to prevent cross-tenant references.
- Test cross-tenant reads, updates, deletes, exports, file access, search, retrieval, websocket/event subscriptions and AI tools. Negative isolation tests must be part of CI.
- Use least-privilege database credentials. Apply PostgreSQL Row-Level Security as a second barrier where it can be correctly enforced; application authorization remains mandatory.
- Secrets are held in deployment secret stores/environment configuration, never in client bundles, checked-in files, prompts, logs or error responses.
- Apply rate limiting to authentication, expensive queries, uploads, webhooks and AI endpoints. Validate inputs, bound request sizes and use safe output/error handling.
- Audit privileged actions, permission changes, exports, financial actions and AI-triggered operations. Keep audit records append-only; corrections are new events, not silent edits.

## 6. Business data integrity rules

These rules apply regardless of frontend behavior or AI provider.

1. **Transactions:** related business writes must be committed atomically. Define transaction boundaries for sales posting, stock movement, receiving, payments and ledger operations.
2. **Idempotency:** sensitive create/post endpoints (especially payments, invoices, stock transfers and webhooks) must support idempotency keys or an equivalent deduplication mechanism.
3. **Inventory ledger:** represent changes as traceable stock movements. Correct mistakes with reversing/corrective movements; do not silently rewrite historical movement records.
4. **Financial ledger:** posted ledger entries are immutable. Corrections use reversal/adjustment entries with references and audit trail.
5. **Outbox/reliable events:** where a database commit must trigger an external event or background task, use a transactional outbox or another durable delivery design. Do not rely on a best-effort in-memory callback after commit.
6. **Concurrency:** protect stock reservations, sequence allocation and financial postings against concurrent writes using database constraints, transactions and appropriate locking/version checks.
7. **Time and money:** use explicit currency and timezone fields; store monetary values in appropriate decimal types, never binary floating point. Define rounding rules in domain code.
8. **Deletion:** use explicit retention, archival and soft-delete policies only where appropriate. Financial/audit history must not be removed through ordinary CRUD endpoints.
9. **Migrations:** schema changes are reviewed, versioned, reversible where practical and tested on a staging copy. Production migrations use the production migration command in a controlled release step; never run destructive reset commands against production.

## 7. Multi-provider AI architecture — mandatory

LEXA must support both no-cost/free-tier and paid AI providers through a stable internal interface. Free offerings are quotas that can change; do not design the service assuming that any specific free quota is permanent or commercially guaranteed.

### 7.1 Provider registry

Maintain a centrally managed registry containing, per provider/model:

- Provider and model identifier; enabled/disabled state; environment and region eligibility.
- Supported capabilities: text, structured outputs, tool/function calling, vision, embeddings, streaming and context limits as applicable.
- Commercial tier: free quota, paid, customer-provided key or approved self-hosted.
- Current availability, quotas/rate limits, timeout and retry policy.
- Approved data-sensitivity classes and the current terms/privacy review reference.
- Cost configuration and metering method; whether an estimate is available or final provider cost must be reconciled.

Initial provider candidates (enable only after testing and terms review):

- **Free-tier/low-cost options:** Google Gemini API free tier, Groq, Cerebras, Cloudflare Workers AI and eligible free models available via OpenRouter.
- **Paid options:** OpenAI API, paid Gemini API, Anthropic API and other reviewed providers.
- **Optional later option:** approved self-hosted/open-weight models for workloads requiring more control or predictable per-token economics.

This is a capability list, not a promise that all providers are always free, available in every region, allowed for each data type, or supported for every task. Quotas, free eligibility, terms and model availability must be rechecked before enabling a route and periodically thereafter.

### 7.2 Request routing policy

All requests flow through the LEXA AI orchestration module. Business modules must never embed provider keys, choose a provider ad hoc or call a provider directly.

For every AI request:

1. Authenticate the user and derive tenant/branch scope.
2. Classify the task, required capabilities, sensitivity, expected latency and risk.
3. Apply the tenant's AI policy, provider allowlist, data-sharing consent, plan entitlement and remaining quota/budget.
4. Select an eligible model based on task quality, capability match, availability, latency and actual cost—not simply “free first”.
5. Apply bounded timeouts, token/output limits, rate limits and retry/fallback budgets.
6. Validate structured output against the expected schema and validate any proposed tool arguments.
7. Record provider, model, task type, tenant/user IDs, duration, token usage, estimated/actual cost, fallback path, outcome and correlation ID.
8. Return a safe result or a clear unavailable/limit-reached response. Do not silently exceed the tenant's paid budget or violate data policy to keep the feature working.

Fallback is allowed for eligible transient errors such as timeouts, provider unavailability or rate limits, and only to another model that satisfies the same data policy and capability requirements. Do not blindly retry authentication failures, invalid requests, policy denials or unsafe outputs. Use bounded retries, backoff, and circuit-breaking/cooldowns to prevent loops.

### 7.3 Free versus paid data policy

- Free-tier status is not a privacy guarantee. Review and record each provider/model's current terms, data-use rules, regional restrictions and retention settings before enabling it.
- Default free-tier use to public, synthetic, redacted or otherwise approved low-sensitivity tasks.
- Do not send payroll, credentials, private customer details, confidential documents, payment data or sensitive financial records to a free-tier provider unless that exact provider configuration is explicitly approved for that data class under the tenant's policy and applicable terms.
- Paid status alone does not automatically make a provider suitable. Verify data-processing commitments, retention/training settings, regional terms and any required contractual protections.
- Minimize inputs, redact unnecessary identifiers, avoid storing raw prompts/responses by default, and define explicit retention and deletion behavior.
- Each tenant must have an AI policy: enabled/disabled, permitted features, allowed providers/data classes, limits, and whether customer-provided API credentials are supported.
- If a request is disallowed, fail closed with a clear explanation. Do not route it to a less-restricted provider as a workaround.

### 7.4 AI tools and actions

AI can suggest actions but cannot access arbitrary SQL, database credentials, secrets, shell commands or unrestricted internal APIs.

- Expose a registry of narrow, documented tools (for example `get_sales_summary`, `search_authorized_products`, `draft_purchase_order`).
- Every tool call must re-check the user's current identity, tenant scope, permissions, argument schema and business invariants at execution time.
- Reads are preferred initially. Writes require a preview/confirmation flow for the user and a separate validated application-service call.
- Financial postings, payment execution, stock adjustments, permission changes, tenant administration and destructive actions require explicit authorization and human confirmation; AI must never bypass approval policies.
- Store tool name, validated arguments or a safe reference, authorization decision, result status and audit correlation. Redact secrets and sensitive data from audit payloads.
- Treat user-uploaded documents, retrieved web content and tool output as untrusted data. Apply prompt-injection defenses, output validation, restricted tools, time/token limits and evaluation tests. A system prompt alone is not a security boundary.

### 7.5 Initial AI features

Roll out in this order:

1. Read-only natural-language reports and explanations based on authoritative queries.
2. Document summarization and structured extraction with human review.
3. Search over tenant-authorized documents using permission-filtered retrieval.
4. Forecasts/reorder recommendations with transparent inputs, assumptions and confidence limitations.
5. Drafting business actions and workflow assistance with explicit preview and approval.
6. Multi-step agents only after tool permissions, evaluation, audit, budget and failure recovery are mature.

Calculations for revenue, margins, taxes, stock valuation and ledger balances must come from deterministic code/SQL. AI may explain those calculations; it must not invent authoritative values.

## 8. SaaS capabilities required in the architecture

The platform must be able to implement these capabilities through shared backend services rather than one-off conditions in each module.

- Tenant, organization, branch, memberships, invitations and role/permission management.
- Plan catalog, trials, entitlements, usage limits, quotas, plan changes and subscription status. Payment provider is intentionally adapter-based until the target markets and payment/settlement requirements are confirmed.
- Usage metering for AI requests, background processing, storage and other billable/limited resources.
- Feature flags and staged rollouts, per tenant where applicable.
- Notification channels and delivery history; scheduled and recurring jobs.
- Import/export jobs with progress, retry, authorization and audit trail.
- Webhooks and external integrations with signature verification, idempotency, retry and dead-letter/replay capability.
- Search, saved views and report definitions scoped to the authorized user/tenant.
- File/document management, access control, export and retention policies.
- Audit history, administrative support tooling, security-event visibility and data export/deletion workflows.
- Service health, error reporting, trace correlation, metrics, backup/restore drills and incident runbooks.

Do not mark a capability “implemented” simply because a frontend screen exists. It is implemented only when its API, authorization, persistence, validation, operational behavior and tests are present.

## 9. API standards

- Base path: `/api/v1`.
- OpenAPI remains the contract used by frontend/backend integration. Generate or validate typed clients from it where practical.
- Use DTO validation at request boundaries; reject unknown or invalid inputs for sensitive endpoints.
- Standardize pagination, sort/filter allowlists, error format, correlation IDs and timestamps.
- Use consistent status codes and never return stack traces, secrets, database details or provider internals to end users.
- Authentication and authorization are distinct: a valid token does not imply permission to access a tenant resource.
- Keep endpoints backward-compatible when possible. Breaking changes require a versioning/deprecation plan and contract tests.
- Use webhook signature verification, idempotency and replay protection for external callbacks.
- Do not expose internal service URLs, raw provider responses, AI prompts or implementation notes to the public frontend.

## 10. Reliability, queues and workflows

Use BullMQ for ordinary durable background jobs such as imports, exports, notifications, AI document processing and scheduled reports. Every job needs a bounded retry policy, backoff, idempotent handler, timeout, correlation ID and observable terminal failure state. Separate queues by workload/priority when isolation is needed.

Use an outbox or durable event mechanism for events coupled to database commits. Jobs must not assume they execute exactly once; implement handlers to tolerate repeat delivery. A dead-letter/replay process must be available for jobs that repeatedly fail.

**Temporal is not required for the initial version.** Add it only if long-running workflows with complex state, timers, compensation and recovery become difficult to manage safely with the current job system.

## 11. Observability and operations

- Structured JSON logs with request/correlation IDs and tenant IDs where appropriate; never log access tokens, API keys, passwords or raw sensitive payloads.
- OpenTelemetry traces across API requests, database calls, jobs and AI provider calls where possible.
- Sentry or equivalent for uncaught errors, release tracking and frontend/backend issue correlation.
- Health/readiness endpoints; readiness should verify only required dependencies and avoid leaking configuration details.
- Alerts for error-rate spikes, queue backlog, failed migrations, provider outage, rate-limit exhaustion and AI spend anomalies.
- Usage dashboards by tenant, provider, model, feature and date. Separate estimated AI cost from reconciled billable cost.
- Secrets rotated through deployment secret stores. Separate development, staging and production credentials, databases and provider keys.
- Backup/restore and recovery procedures tested periodically—not just backups configured.

## 12. Repository and integration rules

- Preserve the current LEXA frontend structure and behavior unless a specific, reviewed change is needed for integration.
- Add backend code in a clearly bounded backend directory (recommended: `/backend`) or a separately maintained backend repository if deployment constraints require it. Do not mix backend implementation into unrelated frontend files.
- Keep `openapi/backend-contract.yaml` as the shared API contract baseline; change it deliberately with tests and documentation.
- Provide separate API and worker entry points/configurations even if both build from the same backend package.
- Keep `.env.example` limited to variable names and safe placeholders. Never include real values.
- Do not change protected GitHub workflow/permission files to work around missing tokens or permissions. Pipeline changes must use the repository's existing authorized workflow.
- No production seed/demo data, mock API responses or fake success paths. Test fixtures belong only in tests or isolated development environments and must be clearly marked.

## 13. Quality gates before production

A backend release is blocked unless the applicable checks pass:

- Clean dependency install and production build.
- TypeScript type check, lint and unit tests.
- Integration tests against a disposable/staging PostgreSQL database.
- OpenAPI contract validation and frontend integration compatibility checks.
- Migration validation and a tested rollback/recovery plan for risky changes.
- Tenant-isolation tests and authorization-negative tests.
- Financial/inventory transaction, concurrency and idempotency tests.
- AI provider routing, budget exhaustion, privacy policy, timeout, fallback and schema-validation tests.
- Secret scanning and dependency/security checks.
- Smoke tests against the deployed API, worker and critical frontend workflows.

The latest frontend build logs previously shared for LEXA showed TypeScript errors even after unit tests passed. Those errors must be corrected and the production build made green before the frontend can be declared integration-ready. This does not change the architecture; it is a prerequisite to reliable integration.

## 14. Delivery order

### Phase 0 — Stabilize integration baseline
- Fix current frontend TypeScript/build failures.
- Review and freeze the existing OpenAPI contract.
- Identify existing auth/data models and deployment secrets without changing the established frontend structure.

### Phase 1 — Backend foundation
- Create NestJS/Fastify API, Prisma schema/migrations, health/readiness, structured errors, logging and CI checks.
- Verify Supabase Auth tokens and implement tenant membership/RBAC foundations.
- Add audit infrastructure and tenant-isolation tests.

### Phase 2 — Core ERP persistence
- Implement domain modules incrementally against the OpenAPI contract.
- Build transactional sales, stock, purchasing and finance flows with invariants, idempotency and audit.
- Replace mock paths with real API-backed loading, empty, error and success states.

### Phase 3 — SaaS platform capabilities
- Add entitlements, plan/usage metering, jobs, notifications, file handling, webhooks, imports/exports and administrative visibility.
- Add a payment provider only after target-market requirements are decided.

### Phase 4 — Multi-provider AI
- Deploy the AI gateway and implement the LEXA routing/policy/metering layer.
- Start with low-risk read-only features and approved provider/model routes.
- Add retrieval, evaluations, tool calling and confirmation-gated actions only after policy tests pass.

### Phase 5 — Production hardening
- Run load, concurrency, tenant-isolation, abuse, recovery, provider-outage and cost-limit tests.
- Validate alerts, backup restoration, data export/deletion workflows and incident procedures.
- Scale or extract services based on measured needs.

## 15. Explicit non-goals and prohibited shortcuts

- No premature microservices architecture.
- No direct AI-to-database SQL access.
- No provider API keys or confidential backend secrets in frontend code.
- No silent fallback from a restricted/free route to a paid route that could incur unapproved cost or violate data policy.
- No mixing business records across Neon and a second database as competing sources of truth.
- No trusting frontend roles, tenant IDs, prices, totals or AI-generated facts without backend validation.
- No destructive production migrations, resets or test/demo seeding.
- No claims that a backend module or SaaS feature is complete until persistence, security, validation, observability and tests exist.
- No architectural rewrite of the existing frontend just to accommodate the backend.

## 16. Change control

This document is the **LEXA Backend Architecture Lock v1.0**. Changes to the framework, authoritative database, identity boundary, tenant-security model, AI gateway/provider policy, API contract strategy, or financial/inventory integrity rules require an Architecture Decision Record containing:

1. Decision and reason.
2. Alternatives considered.
3. Security/privacy impact.
4. Data migration and backward-compatibility impact.
5. Cost, operational complexity and failure-mode impact.
6. Test and rollout plan.

Feature-level additions that obey this baseline do not require reopening the architecture lock.

## 17. Official references

These references support the implementation choices. Review current terms, limits and versions before enabling a provider or deploying a release.

- NestJS modules: https://docs.nestjs.com/modules
- Prisma Migrate production workflow: https://www.prisma.io/docs/orm/v7/prisma-migrate/workflows/development-and-production
- Supabase JWT verification: https://supabase.com/docs/guides/auth/jwts
- BullMQ rate limiting: https://docs.bullmq.io/guide/rate-limiting
- LiteLLM gateway architecture and routing: https://docs.litellm.ai/docs/proxy/architecture and https://docs.litellm.ai/docs/routing
- LiteLLM spend tracking and budgets: https://docs.litellm.ai/docs/proxy/cost_tracking and https://docs.litellm.ai/docs/proxy/users
- OpenAI Responses API: https://developers.openai.com/api/reference/responses/overview
- OpenAI function calling: https://developers.openai.com/api/docs/guides/function-calling
- Gemini API additional terms: https://ai.google.dev/gemini-api/terms
- Cloudflare Workers AI pricing: https://developers.cloudflare.com/workers-ai/platform/pricing/
- Groq rate limits: https://console.groq.com/docs/rate-limits
- OWASP Top 10 for LLM Applications: https://owasp.org/www-project-top-10-for-large-language-model-applications/

---

**Implementation status:** This document locks the target architecture. It does not claim that the backend has already been built, deployed, or connected. Implementation is complete only when the relevant code, migrations, tests, environment configuration and deployment verification exist.
