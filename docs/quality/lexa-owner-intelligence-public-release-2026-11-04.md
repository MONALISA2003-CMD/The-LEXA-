# LEXA owner intelligence, business UI and public release audit

Date: 2026-11-04. Source: clean GitHub import archive, with targeted changes described here.

## Delivered changes

- Added `LEXA is a subsidiary of AMAAL GROUP.` to the authenticated application's footer, public marketing page footers, and sign-in/create-account footers.
- Removed visible account-security status cards, business health, and infrastructure/privacy notice panels from Business Settings. Backend password controls and authentication mechanisms remain untouched. Removed the unused public security-status component and disabled the prebuild generator that previously reinserted it.
- Enforced owner-only Intelligence execution on role-policy and controller `access()`; removed accountant grant. Hide Intelligence from non-owner sidebar and report shortcuts.
- Improved error handling: HTTP 403 owner-only, CSRF rejection and usage exhaustion have separate customer messages; verified CSRF rejection can trigger one safe retry with a new token, never an unconditional POST retry.
- Refreshed Intelligence interface to business-focused queries and actions; removed provider counts, generic AI badges, duplicate snapshots and developer jargon.
- Introduced owner-reviewed **draft purchase request** and **project task** creation using existing, audited, tenant-scoped APIs. No model-generated tool instructions are directly executed. The purchasing request remains a draft; ordinary financial/approval controls apply.
- Added a bounded classifier, fast/medium provider routing, optional second Gemini free key, provider cooldowns, and a 26-second upper limit for outbound provider attempts. Never silently uses a paid model; explicit complex-analysis inquiries return no charge and request review. Two Google keys in the same project do not provide separate project quota.
- Added a bounded, no-network Python operations analytics worker for deterministic inventory, sales, and finance questions; it consumes only permission-filtered aggregates. Python finance forecasting worker remains intact. Neither worker can write database records.
- Rebuilt the Delivery metrics as responsive cards with semantic text/number spacing, and no zero totals when the parent data queries fail. Added an explicit retry.
- Replaced **66 sidebar module icon instances** with a coherent original line-glyph set, while retaining standard icons for common UI controls.
- Added an owner-only, contextual Intelligence shortcut in the app header; public finance/reports shortcuts are hidden from non-owners.
- Updated backend source regression tests, including owner-only permission checks, dual Gemini routing and paid-inquiry restrictions. Added Python worker tests and frontend-source checks.

## Review and limitations

- All changes are **source only**. No deployment, live database deletion, billing, Cloudflare DNS or credential changes have been made in this iteration.
- `lexaaamaal.com` is the configured domain. `lexaamaal.com` in the failing screenshot is **a different spelling** and was not found under the connected Cloudflare account. A redirect requires ownership/control of that different domain; it cannot be implemented from the canonical site's source alone.
- `GEMINI_FREE_API_KEY_2` (or `GEMINI_SECOND_API_KEY`) is an optional second credential. Its presence was **not verified**, and a second key in the same Google Cloud project shares project rate limits.
- The source has a fast deterministic Python read path for selected operational questions, not a fully autonomous Python agent. Other open-ended questions use the provider router, which requires an enabled entitlement and available model credentials.
- Only the **two reviewed write workflows** are included. Broader write access to Finance, payroll, inventory adjustments and approvals was **not enabled**; it requires further permission, approval and audit design.
- No proprietary third-party font assets or icon package were introduced. The sidebar was migrated to original consistent vector glyphs; other function-level icons remain unchanged.
- Broad terminology review is incomplete across LEXA's 70+ screens. The screenshot-specific texts and the owner assistant's most visible phrases were corrected.
- Full frontend TypeScript/Vite compilation and browser integration tests require npm dependencies unavailable here. Authenticated owner-action and provider performance tests remain release requirements.

## Required release gates

1. Run the repository's GitHub source-import workflow and confirm backend & frontend full builds.
2. Confirm 403 Intelligence requests now differentiate CSRF/session from genuine role denial with authenticated live owner sessions.
3. Test that CEO/owner is allowed, accountant and other roles denied through direct API calls and that tenant/branch changes cannot expose others' information.
4. Verify both reviewed write flows including idempotency, no duplicates and audit events on isolated test tenants.
5. Confirm the optional second Gemini credential, model names, quotas and data handling before connecting credentials.
6. Check delivery on narrow devices and test dashboard empty/error states with real backend responses.
7. Update and verify canonical DNS/search indexing; do not assume ownership of `lexaamaal.com`.
