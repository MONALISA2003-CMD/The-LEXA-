# LEXA AI routing

## Runtime design

The current assistant uses the native TypeScript `AiRouterService` inside the existing NestJS API:

```text
LEXA web application → Render NestJS API → provider allowlist and fallback router → AI provider
```

The API keeps provider credentials, verifies the session and workspace/branch permissions, builds an allowed aggregate context, applies timeouts and provider fallback, and records usage metadata. The model has no SQL, database, browser, shell or business-write tools.

## Provider policy

The configured routes are free/developer endpoints: Gemini, Groq, OpenRouter (`openrouter/free`) and NVIDIA NIM. Provider/model availability, eligibility, privacy terms and request limits may change. Free routing cannot guarantee unlimited usage or fixed latency. Paid-provider routing remains disabled while `LEXA_AI_PAID_TIER_ENABLED=false`.

## Data boundary

The assistant receives only permission-filtered business aggregates. It must not receive raw customer or employee profiles, contact details, salaries, credentials, attachments or document contents. Provider prompts and completions are not stored in the LEXA usage ledger; request metadata, provider/model, tokens, latency and status are recorded.

## Operational controls

Keep all provider keys in Render's private environment. Confirm the account's billing mode and privacy terms for each provider before enabling it. Rotate or disable a provider when its free quota is exhausted, the model is withdrawn, or terms no longer meet the data policy. Verify provider status and perform a real authorised workspace smoke test after deployment.
