# LEXA release: GitHub Actions #165, payment review, activation email and account screens

## Live-state and authority boundary

This document describes source changes only. The refreshed ZIP has **not** been imported,
the new frontend has **not** been built on GitHub/Vercel, and no customer subscription or
payment has been modified. LEXA's live public hostname is `lexaaamaal.com`; the existing
Vercel project has that domain attached. The separate `app.lexaaamaal.com` hostname is
not currently attached to that project. Keep existing API/CORS allowlists for compatibility.

## Source repair for import #165

- `AppShell.tsx`: React `lazy` and `Suspense` imports included for the browser demo's
  real business-area register screens.
- `browserDemoSeed.ts`: resolve product category IDs, reject undefined product entries
  at type-check time, and populate required sale/customer properties with concrete values.
- `browserDemoSeed.ts`: use Dexie's documented table-array form of the transaction API,
  rather than an unsupported eight-argument overload or spread of arbitrary tables.
- Keep the browser-only demo database, local dataset, production API request block,
  and real LEXA business-area controls. Neither email nor payment providers operate in demo mode.

## Platform administrator payment review

- The internal `LXA-*` request code **does not prove funds arrived**.
- Payment review now has explicit steps: enter the **receiving provider's actual reference**,
  record a meaningful review note, and affirm independent receipt of exactly UGX 50,000.
- The action is disabled until the requirements are met. The screen tells the administrator
  which requirement remains outstanding. The screenshot's placeholder
  "Confirmed in recipient's account" was not a completed reference field.
- Server-side checks are authoritative and retained: admin session/role, CSRF, amount,
  genuine provider reference, verification phrase, duplicate reference checks,
  serializable transaction and audit record.
- Manual verified payment activation follows the same restrictions. No business is
  activated merely by a screenshot, customer-entered SMS or a review note.

## Customer subscription and sign-in screens

- Customer accounts with a submitted payment see **Under review** with a status-refresh
  option instead of a redundant disabled payment form. A paid account shows subscription
  period and direct access to its business.
- Mobile payment status has a clearer sequence and consistent form spacing.
- Sign-in copy names real business tasks, includes recovery and demo entry, and shows
  a confirmation notice when accessed from an activated-subscription email. The top
  return link points to the actual LEXA homepage, not a protected onboarding route.

## Automatic confirmation email

After a permitted administrator independently verifies the receiving account and approves
payment, the subscription is activated in one committed database transaction. **Only after
commit** LEXA sends the verified business owner's email a subscription confirmation using
Resend. The message includes business name, UGX 50,000, paid-through date (East Africa Time)
and a link to `https://lexaaamaal.com/sign-in?subscription=active`.

The link **is not a bearer-token login** and cannot approve payment, authenticate a user,
or bypass an existing email/password/MFA requirement. The signup email address must have
already been verified through the registration process. If delivery fails, the subscription
remains recorded and active; the admin sees an explicit warning. Re-approving a payment does
not issue a second entitlement or duplicate a notification.

Resend's `lexaaamaal.com` sending domain was confirmed *verified* and enabled on 7 November
2026, but delivery in production also depends on valid `RESEND_API_KEY` and
`RESEND_FROM_EMAIL` environment variables on Render. Verify those configured values
and run an authorized, non-production mail-delivery test before relying on the workflow.
Do **not** test by approving a customer's actual payment without a verified bank receipt.

## Account-link host

`render.yaml` and the backend verification, invitation, welcome, account-protection and
platform-administration mail-link fallbacks point to the **actual** public hostname,
`https://lexaaamaal.com`. If Render has a dashboard-level `FRONTEND_PUBLIC_URL` setting,
change it to that URL as well; Blueprint content alone does not guarantee existing
service environment variables are updated. The older separate-domain deployment guide
(`docs/deployment/public-landing-demo-release.md`) is historical and must not be used
as the current canonical deployment plan. The historical `lexa-frontend/marketing/vercel.json`
redirects assume a separate marketing project and are not the active Vercel project.

## Verification and release gates

- Backend Node tests: **484 passed**, 0 failed.
- Repository Python unit tests: **18 passed**, 0 failed.
- Route uniqueness: 563 registrations across 36 controllers.
- Migration structural checks: 57 migrations.
- Backup inventory: 227 table decisions covered.
- Frontend module palette: 11 business areas, 65 navigation routes.
- Public/demo URL, static assets, browser demo isolation and importer layout checks: passed.
- TypeScript/TSX syntax: 370 files parsed without errors. This is **not** a substitute
  for the dependency-installed TypeScript type-check or Vite build.
- All 10 compiler errors from run #165 were addressed in source; **a new GitHub build is
  still required to prove the whole frontend compiles**.

**Release order:** Upload a single root-level source ZIP, wait for GitHub import and E2E,
wait for Render and Vercel deployments, verify the marketing homepage, `/demo/`,
`/sign-in` and controlled non-production payment-review/email workflow. If any step is
red, do not claim production is green.
