# Install — LEXA Module Integration Increment 1

1. Download `LEXA_Module_Integration_Increment_1.zip`.
2. Extract the archive at the repository root of `MONALISA2003-CMD/The-LEXA-` on the `main` branch.
3. Merge the `backend/` and `lexa-frontend/` folders into the existing folders. Do not delete or reorganize unrelated project files.
4. Commit the overlay to `main`.
5. Confirm Render service `lexa-backend-api-live` still has a blank Docker Command override. Its Dockerfile runs Prisma migrations before starting NestJS.
6. Wait for the automatic Render and Vercel builds to finish; then verify health and test one cross-module hand-off.

No manual SQL should be run against production. The included migration is applied by the Render Docker startup command.

See `MODULE_INTEGRATION_INCREMENT_1.md` for the covered modules, new routes, and acceptance checks.
