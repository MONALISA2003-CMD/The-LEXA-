# ADR-0001: Identity, sessions and password recovery source

- Status: accepted as the current implementation direction; operational provider verification remains open.
- Date: 2026-10-31

## Decision

LEXA uses its own PostgreSQL-backed identity, membership and session model as the sole application authentication source for the current release. The NestJS backend issues opaque, hashed session tokens in secure HttpOnly cookies, uses CSRF protection for unsafe browser requests, and loads active workspace memberships from the same database. Do not add a parallel Supabase Auth session or trust a frontend-supplied user/tenant identifier. The decision preserves a single authority for tenant membership, branch grants and role checks.

The initial owner bootstrap is one-time: the bootstrap endpoint requires the configured `LEXA_BOOTSTRAP_SECRET` and refuses to create an owner once any user exists. Remove/rotate the bootstrap secret after the initial owner is created. The repository cannot establish whether the live Render secret has already been removed or rotated; verify this in the hosting dashboard before release.

## Password recovery

The backend issues short-lived, single-use reset tokens and sends a delivery request to `PASSWORD_RESET_DELIVERY_URL`; the frontend reset link origin comes from `FRONTEND_PUBLIC_URL`. This is a provider-neutral HTTP delivery adapter, not proof of a configured SMTP, SendGrid, Resend or other provider. The endpoint returns a service-unavailable error when delivery is not configured. Before release, configure an authenticated HTTPS webhook/worker, ensure the provider never logs reset tokens, verify sender/domain authentication, and test delivery plus single-use expiry end-to-end. The live Render variables are not visible in this source archive and therefore remain unverified.

## Consequences

- `GET /auth/session` is canonical; the duplicate `GET /session` alias is removed.
- The frontend must use the session cookie and shared API client; no localStorage bearer token.
- Cross-tenant authorization remains enforced server-side in addition to any future PostgreSQL RLS.
- Reconsider this ADR only through an explicit migration plan that prevents dual-session identity and preserves membership/branch authorization semantics.
