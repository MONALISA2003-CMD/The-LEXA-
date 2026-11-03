# LEXA Intelligence Release — Business Reports & Assistant

## Premium interface
- Business Reports: Executive Jade (#087F76), responsive 12-family report library, current vs period data, date presets, real SQL-based trend charts, payment breakdown, CSV and print exports, source module links.
- LEXA Assistant: Aurora Amethyst (#6F49DB), model-backed chat, suggested prompts, live status, provider fallback, copyable responses, privacy-safe aggregate data and a non-AI fallback snapshot.
- Backend continues using NestJS + PostgreSQL/Neon row-level security on the existing single Render service. No new Python server or monthly charge.

## Deploy and validate
1. Upload the *full repository ZIP* through the existing GitHub workflow. Never upload a partial ZIP or one containing README_FIRST.md.
2. After GitHub Actions succeeds, verify Render backend deploy and Vercel frontend deploy.
3. From an existing CEO account open Business Reports, switch all report families, try 30 days, view graphs and export CSV.
4. Open Assistant. If model availability shows unavailable, configure **LEXA_AI_ENABLED=true** and at least one approved API key in Render environment: GEMINI_FREE_API_KEY, GROQ_API_KEY, OPENROUTER_API_KEY or NVIDIA_NIM_API_KEY. Keys are not included in the ZIP.
5. Ask a real question with a signed-in CEO account. A configured provider route is not proof of working quota or valid model availability; only a real completed model answer confirms readiness.
6. Confirm read-only snapshot still works when all model providers are offline; check cross-business RLS and staff role restrictions.
7. Check empty businesses, payments vs sales dates, current snapshot balances vs historical flows, and trial balance reconciliation.

## Limitations
- Reports depend on recorded real transactions; missing or empty data will not be fabricated. Detailed drilldowns use existing source modules.
- LEXA Assistant uses existing free/developer model routes with API-key specific quotas; it cannot guarantee every provider will respond until live credentials and quotas are tested.
- Existing advanced CRM/HR analytics are still governed by entitlements. Sensitive employee records, passwords and salary details are not transmitted to external models.
- The release is not confirmed production-green until GitHub import and authenticated live smoke tests pass.

