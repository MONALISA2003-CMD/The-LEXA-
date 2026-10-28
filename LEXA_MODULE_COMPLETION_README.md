# LEXA Phase 5 frontend workflow patch — upload-ready

## Apply this patch

1. In `MONALISA2003-CMD/The-LEXA-`, replace the existing root file `LEXA_MODULE_COMPLETION_PHASE5.zip` with this archive, keeping **exactly the same filename**. Do not upload it under a new name: the existing extractor processes every ZIP in the repository, and the older ZIP still contains a workflow file that GitHub rejects.
2. The existing `.github/workflows/extract-frontend.yml` should extract these files, remove the archive from the working tree, and commit the extracted frontend patch. This archive intentionally does **not** add a new `.github/workflows/*` file, so the existing action does not need the missing GitHub `workflows` permission.
3. Vercel's normal `npm run build` will run the guarded `prebuild` script before TypeScript/Vite. It wires the shared preview workflow graph, generic field mapping, source references, duplicate protection, local preview notes, and core-screen shortcuts. The script is idempotent and is also available to run manually from `lexa-frontend` using `python3 scripts/complete_modules.py`.
4. Verify that the ZIP extractor run succeeds and that the resulting Vercel deployment reaches `Ready` for the commit created by the extractor.

## Important boundaries

This patch completes **browser-local preview workflow interconnections** across the operational module catalogue. It does not turn preview registers into live ledger postings. It does not add cloud sync, shared multi-user storage, authentication enforcement, real payment processing, bank feeds, a URA/EFRIS connection, payroll submissions, or a trusted server-side security audit log. The existing core product, stock, sales and return workflows are preserved.

## Why this archive is shaped this way

The previous extraction run successfully unpacked the patch but its push was rejected because it attempted to create `.github/workflows/complete-lexa-modules.yml`, and the GitHub App token lacks `workflows` permission. This archive avoids that forbidden file and runs the guarded patch during the normal frontend build instead. It does not claim that a production deployment has already happened; check the GitHub Actions and Vercel statuses after replacing the archive.
