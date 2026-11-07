# GitHub Actions #156: offline lockfile-restore repair (7 November 2026)

## Verified failure and root cause

GitHub run `42339373985`, **Refresh LEXA from a clean repository ZIP** #156, completed the archive import and failed at `python3 scripts/clean_repository.py`. The old verified `lexa-frontend/package-lock.json` committed to GitHub still had a **direct** `lucide-react@^0.468.0` dependency. The new frontend intentionally removed Lucide and uses `src/components/LexaIcon.tsx`; the new ZIP excludes npm lockfiles by repository policy. Restoration from `HEAD` therefore produced a lock root that differed from the current `package.json`, and the strict `verify_dependency_locks.py` failed.

## Repair

`verify_dependency_locks.py` continues to restore the complete npm v3 lockfile from the **committed Git object**, with no network resolution or registry call. Its only expanded normalization is a **drop-only** direct dependency change: a dependency listed in the previously committed lockfile but absent from the new package manifest is removed from the root metadata. All surviving resolved npm packages, integrity hashes and URLs remain **unchanged**. The code also prunes a removed direct package only if it is a dependency-free **leaf** and no other package references it. In the actual GitHub lockfile, `lucide-react` is exactly such a leaf, so it is removed from the new npm install graph. Unrelated packages cannot be pruned or changed. This avoids `npm ci` installing the unused library. A changed version, newly added dependency or missing resolved entry is still rejected; pinning is permitted only to an already-locked exact version.

This explicitly allows removal of the unused Lucide library **without reintroducing Lucide on any frontend screen**. No production configuration, account, tenant, or migration is changed.

## Tests and release gates

- `python3 scripts/test_dependency_lock_reproducibility.py` now simulates the exact #156 Git-restore scenario: previously locked Lucide, removed from the new manifest; also checks surviving graph and integrity preservation (pruning only the orphan Lucide leaf), idempotence, required React Query pinned versions, and fail-closed additions/version upgrades.
- `cd backend && npm test` exercises the Python regression through `backend/test/dependency-lock-reproducibility.test.mjs`.
- The normal GitHub importer runs `python3 scripts/clean_repository.py`, `scripts/validate_repository.py`, `npm ci`, backend build, frontend build, then commits. **Do not bypass those checks.**
- Source ZIPs are still required to exclude `package-lock.json`. The importer restores the last verified resolved graph. If future changes *add* a dependency or alter a version, produce a reviewed, matching npm v3 lockfile from a trusted environment; do not silently loosen this check or fetch mutable versions during CI.

## Limits

Local tests verify root-metadata normalization and application contracts. Dependency-installed frontend compilation and live browser workflows require the next full GitHub Actions run; no production deployment is performed here.
