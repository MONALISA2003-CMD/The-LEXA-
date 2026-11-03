# LEXA Bright Executive Blue — CEO interface release, 2026-11-03

## Approved design

- Bright executive design with a pearl `#F6F9FF` workspace canvas, white surfaces, sapphire `#075CF5` primary actions, cyan `#08BDEB`, emerald `#087953` for positive status, gold `#F5C84B` reserved for indicators, and `#17243B` headings.
- Light, permission-filtered navigation. The LEXA brand-lockup itself keeps its navy logo backing for clarity. Existing routes, module IDs and business records are preserved.
- Overview: pale sapphire/cyan hero; explicit action hierarchy; four-column KPI layout on large screens and responsive fallbacks; refined chart, alert, activity and workflow cards. Every KPI and trend still comes from existing verified backend data. No illustrative numbers are injected into the application.
- My Business: premium identity hero; four sections for company profile, CEO-governed team, independently confirmed payment recording methods, and security/governance. An employee without ownership only sees authorized details and no owner-only links.
- Team & permissions: polished invitations, roles and status controls. Permission enforcement remains server-side; CSS cannot grant access.
- Existing optional dark theme remains available. New My Business structural styles retain dark-mode legibility.

## CEO authorization contract

1. Successful verified public signups create a new business and assign its original user `role='owner'`.
2. The UI displays `owner` as `CEO / Owner`, without renaming the persisted role or changing the tenant identity model.
3. Only existing owner-equivalent memberships may manage invitations, employee roles, suspensions and removal. Staff roles are not permitted to invite employees or grant ownership.
4. Staff permissions, suspension, read access, tenant isolation, role enforcement and recorded-transaction integrity remain backed by existing server controls.
5. Staff onboarding is through expiring invitations; staff do not create a separate tenant by accepting one.
6. Existing `owner_administrator` is legacy owner-equivalent within the current policy. This release does not silently change or migrate that authorization contract.

## Scope and safety

- Frontend presentation changes plus a read-only server policy regression test; no schema, migration, seed, database, billing, authentication or API contract changes.
- No direct GitHub writes or production deployments are performed by the patch bundle.
- Do not import a partial overlay into `.github/workflows/repository-import.yml`: it replaces the entire repository source. Build a full canonical import archive from the exact baseline using the provided release builder.
- No real customer metrics or production identifiers are included in mockups or CSS.
- The correct post-import release gate is CI passing, Render/Vercel deployments verified, then browser testing as CEO and employee for layout, mobile, access denial and business isolation.
