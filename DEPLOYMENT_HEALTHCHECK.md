# Render / Vercel deployment health and pinning checklist

## Render API service

Set the existing Render web service's **Health Check Path** to exactly `/health/ready` (not `/api/v1/health/ready`). Nest's global `/api/v1` prefix is explicitly excluded for `/health/live` and `/health/ready`. `/health/live` is a process liveness check; `/health/ready` executes `SELECT 1` and returns HTTP 503 if PostgreSQL is unavailable. Confirm the setting in the Render dashboard and wait for the deployment's health status to become Live. A source ZIP cannot prove or mutate that remote dashboard setting.

## Vercel frontend

Vercel should use the existing `lexa-frontend/` project root and its existing `npm run build` command. The deployment log supplied for this audit shows Vercel ran 22 test files / 96 tests successfully and failed only at `tsc -b` on `TeamAccessPanel.tsx` at that commit. After applying this overlay, rerun the Vercel build and capture the resulting successful deployment ID.

## Commit pinning

The provided Render log identifies source commit `ec68f0163be1e0945f8b6da2cbb4413caa015667`. The project archive supplied for local work has no `.git` metadata; therefore it cannot independently confirm branch HEAD or prove Vercel and Render use the same commit. Pin both services to the same reviewed full SHA in their dashboards/repository settings and retain the resulting deployment IDs. Do not treat this note as proof that either remote service has been changed.
