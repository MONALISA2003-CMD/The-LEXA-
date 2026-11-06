# LEXA account security and privacy — source implementation record

**Implementation status:** Source changes completed for sign-in verification and local account controls; production deployment **not** performed.

## Implemented source paths

- `backend/src/auth/account-protection.service.ts` — account-owned browser recognition, login code challenge and rate limit, TOTP and encrypted secrets, hashed recovery codes, session management, immutable events and privacy preference service.
- `backend/src/auth/account-security.controller.ts` — CSRF-guarded verification and account-management routes.
- `backend/src/auth/account-security-crypto.ts` — cryptographic primitives, encrypted TOTP, keyed email codes and safe browser labels.
- `backend/src/core/core.controller.ts` — Turnstile sign-in enforcement, challenge/session split, password-reset session and browser revocation.
- `backend/src/auth/public-registration.controller.ts` — enforced signup challenge (production by default), strict allowed hostnames and cross-origin session cookie consistency.
- `backend/src/auth/turnstile-verification.ts` — real Siteverify call, exact action and hostname checks, deadline and fail-closed errors.
- `backend/prisma/schema.prisma` plus `backend/prisma/migrations/20261107010000_account_security_privacy/migration.sql` — six RLS-protected account tables, session browser reference, evidence immutability, bounded rate gate, backup registration and session/device ownership guard.
- `lexa-frontend/src/modules/account/` — Account Security, Privacy Preferences, public legal policies, accessible cookie notice and scoped CSS.
- `lexa-frontend/src/modules/auth/AuthPage.tsx` — second-factor sign-in interface, Cloudflare widget and recoverable challenge errors.
- `lexa-frontend/src/app/router.tsx`, `providers.tsx`, `layouts/AppShell.tsx`, `modules/settings/SettingsPage.tsx`, `domain/shared/staffNavigation.ts`, `data/remote/apiAuth.ts` — navigation, authorization-aware availability, preference and security API clients.
- `lexa-frontend/openapi/backend-contract.yaml`, `backend/scripts/check-openapi-coverage.py` — contract coverage includes the new controller (previously missed by the static checker).

## Required release evidence

- Backend tests, Python tests and TypeScript/TSX parse check executed locally. Source-style checks alone do not replace Prisma-generated build, Nest/Vite production build, authenticated HTTP acceptance or Cloudflare provider integration tests.
- Neon staging: additive migration tested in branch `br-frosty-queen-ba5e96ee` (not production), forced RLS/policy evidence and immutability privilege checks verified; production unchanged.
- Production requires verified Cloudflare hostname/sitekey/secret, email delivery and environment secrets as listed in `docs/operations/runbooks/account-security-and-privacy.md`.

## Security and implementation limits

This package does not implement WebAuthn passkeys, high-risk business posting step-up guards or remotely configure Cloudflare WAF rules. A user-facing policy is not itself a legal compliance certification. Optional analytics are off by default and no optional tracking SDK is introduced. Secret keys must be supplied securely in the deployment environment; they are not included in source or the ZIP.

## Local release checks — 5 November 2026

- **Backend regression:** 399 tests passed, zero failures (`node --experimental-strip-types --test test/*.test.mjs`, from `backend/`).
- **Python intelligence regression:** 18 tests passed, zero failures.
- **API contract:** 496 operations, 401 routes, exact parity (account security controller explicitly included).
- **Fastify route uniqueness:** 519 route registrations across 33 controllers.
- **Tenant backup decisions:** 212 table decisions verified (196 schema/migration references).
- **Ledger source coverage:** 15 source workflows verified.
- **Source manifest:** 13 industries and approved specialties synchronized; Electronics V2 remains unchanged.
- **Neon staging:** New account tables, FORCED RLS, ownership policies, immutable evidence privileges, `lexa_login_rate_gate` grants and session-to-device identity guard checked. Database migrations were **not** applied to production.
- **Unavailable in this environment:** dependency-backed NestJS compilation, generated Prisma client validation, Vite frontend build, real Cloudflare Turnstile and Resend provider calls, complete authenticated browser and multi-account HTTP tests. GitHub CI and isolated staging acceptance remain release blockers.
