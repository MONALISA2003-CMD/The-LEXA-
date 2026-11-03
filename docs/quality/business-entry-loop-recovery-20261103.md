# Business access / setup-loop recovery — 2026-11-03

## User-visible failure

After saving or reopening a business, LEXA occasionally returned to the business-setup screen. The recording demonstrated repeated setup rather than the dashboard.

## Production evidence observed before this change

- Render returned HTTP 201 for `POST /api/v1/workspaces` followed by HTTP 200 for `GET /api/v1/workspaces/{id}/branches`, so persistence was working.
- Subsequent `GET /api/v1/workspaces` and `GET /api/v1/auth/session` calls returned HTTP 200, but their success codes did not verify that the business list was populated. Existing database memberships and branches were confirmed without modification.
- The frontend redirected to setup when it received no selected business, even after a successful creation. Repeated creation could result in duplicate businesses.

## Changes in this source archive

1. Backend `GET /workspaces` runs the membership query with an explicitly authenticated user context through `PrismaService.runWithTenantContext`. It does not trust browser preferences.
2. Backend `GET /workspaces/:workspaceId` verifies membership with both authenticated user and tenant scope. This enables a safe server-authorized recovery lookup by business ID.
3. Backend `GET /workspaces/:workspaceId/branches` retains both user and tenant scope through branch authorization and fetching.
4. Frontend business selection can recover a saved business using the protected detail endpoint, without treating a local ID as proof of authorization. A stale ID denied by the server will not hide other accessible businesses.
5. Opening a business passes the server-verified business and branch IDs through route state, minimizing the risk of losing the selection when browser preferences are unavailable.
6. A missing or inaccessible previous business displays recovery guidance rather than immediately prompting creation of a duplicate. Sign-in defaults to the business-selection page.

## Verification completed before packaging

- Backend `npm test`: **94/94 pass**; includes source-specific RLS tests.
- Frontend TypeScript/TSX syntax parse: **132 files passed** (no syntax errors).
- Business-selection function runtime checks using TypeScript transpilation: **6/6 pass**.
- Frontend source generators: executed and confirmed not to overwrite the patched files.
- Repository import layout and build-origin repair fixture checks passed.
- All files preserved in source ZIP root layout; `.github/` and npm lockfiles intentionally excluded.

## Limitations / production follow-up

- The full frontend dependency-backed typecheck, Vitest and Vite build were not run in this container; external npm registry access was unavailable. GitHub Actions and a live browser are the final gates.
- This package does not modify Neon production rows or settings. The earlier tenant-creation RLS hotfix remains a separate existing production configuration.
- GitHub connector content writes previously returned HTTP 403. Upload the entire ZIP to GitHub repository root to let the repository-import workflow produce a new GitHub commit. Verify both Render and Vercel deploy the *same* source revision.
- Test with an existing account: sign in, choose an existing business, open dashboard; then test refresh, logout/login, branch switching, and previously saved business recovery. Do not create more test businesses in production.
- If the workspace list remains empty after deployment, collect response body and correlation/request IDs for `GET /api/v1/workspaces` and inspect the runtime role's RLS session settings. Do not disable RLS or bypass role restrictions to mask the problem.
