# LEXA infrastructure setup — 29 October 2026

## Completed

- Neon project `lexa-backend` created in `aws-eu-central-1` (Frankfurt), PostgreSQL 17.
- Default branch `production` is ready; database `lexa` and role `lexa_app` were requested during project creation.
- Backend foundation has been prepared in `backend/` without changing the existing frontend directory.

## Blockers before provisioning the remaining services

- Render requires an explicit workspace selection. The available workspace is `My Workspace` (`tea-d9cssgflk1mc73br1cp0`). Do not create resources there until the user confirms that workspace.
- Supabase project creation requires the user to choose an organization. The only organization currently listed is `AMAAL` (`pppvlprkeltelimppwvy`). A project estimate was returned as $0/month, but the organization choice still requires confirmation.
- GitHub branch creation was rejected by the connected GitHub integration (`403 Resource not accessible by integration`). Nothing was pushed to `main`; the foundation bundle must be applied through a permitted branch/pull-request workflow.

## Architecture boundary

Neon is the authoritative business database per `BACKEND.md`. A future Supabase project should be an auxiliary capability (if approved), not a second source of truth for ERP business records. The Render API should only be created after the backend Dockerfile is merged into a repository branch that Render can deploy.

## Validation status

- JSON syntax for package and TypeScript configuration files was checked locally.
- Dependency installation timed out in the execution environment, so the full Prisma validation, TypeScript build and live migration have not yet been run. Do not treat this scaffold as production-ready until CI/build and database smoke checks pass.
