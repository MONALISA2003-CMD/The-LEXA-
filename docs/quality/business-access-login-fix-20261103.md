# LEXA business sign-in and workspace entry repair — 2026-11-03

## Customer experience

- The entry page now offers **Sign in to my account** prominently to signed-out visitors. It does not expose the create-business form until the session is verified.
- Signed-in users see **Choose your business**, a selection of existing saved businesses, and **Open my business**. Creating another business is a deliberate secondary action.
- Creating a business now verifies that its first branch exists, stores the chosen business and branch, and only then opens the dashboard.
- If opening fails after the business was created, the page displays a recovery action for the already saved business instead of presenting an unqualified success message or encouraging duplicate creation.
- The application shell no longer redirects to sign-in for every temporary data error. It offers a retry and business-selection option. Missing branches are handled without returning the user to a blank create-business form.
- The sign-in, onboarding, general API error messages and route-error pages use everyday business language rather than developer implementation terms. API error metadata and codes are retained in the error objects for diagnostics.
- Existing authentication, CSRF protection, cookie sessions, tenant boundaries, and local-only development mode are preserved.

## Testing and verification

- `node --experimental-strip-types --test backend/test/*.test.mjs`: **91/91 passed** (in this environment).
- 130 frontend TypeScript/TSX files passed TypeScript syntax/transpilation checks (this is not equivalent to a full strict typecheck).
- Frontend prebuild source generators and build-origin guard completed.
- Added `businessMessages.test.ts` and `OnboardingPage.test.tsx` regression scenarios for user-facing errors, existing-account entry, business selection, successful entry, and saved-business recovery. They must be run with the dependency-backed Vitest suite in GitHub CI.
- ZIP integrity and canonical root structure were checked before delivery.

## Release checklist

1. Upload the ZIP at the root of `MONALISA2003-CMD/The-LEXA-` and let the existing import workflow refresh the source. Do not remove `.github/workflows`.
2. Confirm GitHub's import + frontend tests/typecheck/build and backend pipeline are green. Verify the Vercel production deployment is ready.
3. In a private browser tab, open `https://lexareview.vercel.app/onboarding`: sign-in must be prominent. Sign in and select the already saved business; verify the dashboard and branch load.
4. Test create-business only if you genuinely need another business; do not recreate existing production businesses as a smoke test.
5. Confirm a simulated expired session returns to sign-in and a temporary service error produces a business-friendly retry message.

## Scope

The shared error wording is now standardized for HTTP/network failures, which affects API-backed pages across LEXA. A complete editorial audit of every static label across the entire product, and live sign-in with a real password, were not performed here. No user passwords were requested or stored.
