> **Historical snapshot (1 November 2026):** Provider and deployment observations in this report are point-in-time history. They do not redefine the current Render compute plan; see [current production compute configuration](../deployment/current-compute-configuration.md).

# LEXA — Business language and frontend clean-up

**Prepared:** 1 November 2026  
**Source:** `MONALISA2003-CMD/The-LEXA-` repository package  
**Scope:** Frontend navigation, module access, business wording, account pages and free-model routing.

## What has changed

- Removed the standalone Integration status, Operations centre, Activity and audit logs, Inbox and collaboration, and All modules entries from the frontend navigation.
- Redirected old URLs for retired pages so they do not reopen from bookmarks.
- Kept one Authoritative reports page at `/reports`; the former `/modules/reports` address forwards to it.
- Removed inbox collaboration panels and activity-feed entry points from dashboard and record pages.
- Removed audit activity from the employee and people pages while preserving protected records and server-side controls.
- Replaced technical and internal labels with business language in the login, assistant, reporting, settings, tax, stock, delivery, checkout, employee, and workspace pages.
- Removed generic, unverified payment/EFRIS connection status rows from Settings. The page now checks the actual LEXA service only.
- Removed preloaded sample/demo records from the module directory; the business catalogue starts without sample transactions.
- Made tax-rate entry a true percentage and convert it to basis points for storage. Tax amounts are displayed in the selected business currency.
- Made HR compensation and project cost/budget entry use the selected currency's major units while retaining correct minor-unit storage.
- Replaced the old Groq model identifier with the currently supported `openai/gpt-oss-20b` option.

## AI configuration

The existing single backend assistant routes through free/developer endpoints only, in order:

1. Google Gemini (`gemini-3.5-flash-lite`)
2. Groq (`openai/gpt-oss-20b`)
3. OpenRouter (`openrouter/free`)
4. NVIDIA NIM (`nvidia/nemotron-3.5-lightning-30b-a3b`)

Paid Gemini/OpenAI keys are excluded while `LEXA_AI_PAID_TIER_ENABLED=false`. The assistant is read-only and receives permission-filtered business summaries rather than customer or employee profiles.

The existing Render service was updated with `LEXA_AI_ENABLED=true`, `LEXA_AI_PAID_TIER_ENABLED=false`, and the free model identifiers above. Render confirmed the resulting service deployment reached **live** and the service emitted its “Your service is live” event. The connector does not expose secret values, so the presence of `GEMINI_FREE_API_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY`, or `NVIDIA_NIM_API_KEY` could not be verified. At least one of these API keys must be present in the Render Environment settings before the assistant can answer. No secrets are included in this package.

**Free-tier caution:** Google says content submitted to its free Gemini tier may be used to improve its products. OpenRouter free variants are subject to provider limits; current documentation lists up to 50 requests/day and 20 requests/minute for those variants. Free endpoints may be throttled, changed or withdrawn.

## Verification

- Backend automated tests: **83 passed, 0 failed**.
- Source-generation and design-system preparation scripts: completed successfully.
- Navigation source check: the retired menu entries are absent; `/reports` is the sole reports page.
- Full frontend production build: **not completed** in this workspace because frontend npm dependencies are not installed (`vitest: not found`). No frontend green-build claim is made.
- Vercel access through the connected project integration returned an access-denied response. The modified frontend source has therefore **not been deployed to `lexareview.vercel.app`** from this session.

## Deployment handoff

This archive contains the updated source tree. Apply the contents to the GitHub repository root and let the linked Vercel project build the new commit. Then run the frontend checks with dependencies installed and verify the production deployment. Keep provider API keys in the existing Render service Environment settings only; never add them to GitHub, Vercel frontend variables, or this archive.
