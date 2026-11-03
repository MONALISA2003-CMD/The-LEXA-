# LEXA production hotfix — password reset and welcome email

**Date:** 3 November 2026  
**Source branch:** `main`, base release `0339023bb6f6efa8d91163333b1cd01fa0600029`  
**Scope:** public customer registration, password recovery and onboarding communications.

## Root cause

The `/reset-password?token=...` frontend previously read its one-time token from `window.location.search` on **every** render. A security effect removed that token from the address bar after the page mounted. Typing in the password field triggered another render, losing the token and causing the erroneous "This recovery link is incomplete" message even when the emailed link was valid. The backend and Resend had already delivered valid links.

The frontend now captures the token **once** with a lazy React state initializer, retains it only in component memory, and clears the URL. The password form is not shown when a reset token is genuinely absent; users are directed to request a fresh emailed link. No tokens, reset secrets, or credentials are stored in the repository.

## New transactional welcome message

A welcome message is sent automatically when a user becomes active through:

1. A **verified self-service owner signup** (`POST /api/v1/auth/signup/verify`) after a PostgreSQL transaction creates a user, their new private tenant, their owner membership and first branch.
2. **New employee invitation acceptance** (`POST /api/v1/auth/invitations/join`) after invitation verification creates the employee account and membership.

The message provides a short product introduction plus sales, inventory, procurement, finance, people operations, projects/production, reporting, team permissions and platform security. Contact information is WhatsApp `+256 749 064282` and phone `+256 200 912134`. It links to `https://lexaaamaal.com/workspace`. Owner messaging explains that full permissions apply **inside their own business**; employee messaging respects assigned permissions.

Mail uses the existing restricted Resend key (`RESEND_API_KEY`) and verified sender (`RESEND_FROM_EMAIL`) stored in Render. The provider receives an idempotency key derived from the new user ID to avoid duplicate sends on retries. Welcome delivery is best-effort after the successful account transaction; it **does not** undo an activated user if the email provider is unavailable. Delivery failures are logged as `LEXA_WELCOME_EMAIL_DELIVERY_FAILED`. There is currently **no dedicated durable retry worker for welcome delivery**, so monitor Resend and Render logs for failures and add a durable retry mechanism when implementing the background-worker service.

## Validation and deployment

- Backend tests: **115 passed / 0 failed**, including five new welcome/reset checks.
- Repository layout validator: passed.
- OpenAPI exact coverage: 306 operations / 243 routes, passed.
- Adapter coverage: 17 domain adapters, passed.
- Backup inventory: 162 decisions, passed.
- TypeScript syntax/transpilation checks for the four touched source files: passed.
- Full `npm ci`, backend Nest build and frontend Vite build **not run locally** due to unavailable npm packages/network; GitHub import workflow is the required release gate.

The source ZIP is a **complete canonical repository source archive**, not a patch. Upload the ZIP itself (do not extract it) to the **root** of `MONALISA2003-CMD/The-LEXA-` on `main`; `.github` is intentionally excluded and retained by the existing import workflow. The workflow validates, tests and builds, then commits the new source to `main`; Render and Vercel automatically deploy the updated commit. Avoid uploading any other ZIP in the same commit.

After green CI and both production deployments are ready:

1. Open `https://lexaaamaal.com/forgot-password` and request a **new** recovery link. Previously delivered links expire after 30 minutes and may already have been consumed.
2. Open the actual **Reset password** link from that message in a normal browser and confirm the token is no longer in the address bar; enter and confirm a new password. Verify sign-in works with the new password and old sessions are invalidated.
3. Create a **new** business account with an unused email; verify email and confirm the owner can access only their own tenant. Check the welcome message was delivered and contains the support contacts.
4. Accept a new employee invitation and verify employee welcome email and branch/role scope.
5. Check Render logs, Resend emails and Cloudflare rate limiting. Do not disable CSRF or relax tenant isolation.

No DB migration is introduced by this hotfix, and production database data must not be reset.
