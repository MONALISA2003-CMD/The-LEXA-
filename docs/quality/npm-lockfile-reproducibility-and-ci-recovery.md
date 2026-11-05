# Reproducible npm dependency locks and GitHub ZIP importer recovery

## Incident

On 2026-11-05 the source importer workflow run **41992121743** (#96) failed in `scripts/clean_repository.py` before backend or frontend compilation, with `ETARGET No matching version found for @tanstack/query-core@5.106.1` during `npm install --package-lock-only`. A prior run **41991991445** (#95) failed because the triggering commit removed a root ZIP and the importer could not find the selected archive. These are separate failures.

## Root cause

The LEXA import ZIP historically contained no npm lockfiles and replaced the entire working tree (except `.git` and `.github`). The cleanup script then generated new lockfiles from wide semver ranges on every import. This undid version pinning already present in Git and exposed the importer to partially published or unavailable dependency versions. `@tanstack/react-query` had an unconstrained `^5.90.2` range; GitHub's previous committed `lexa-frontend/package-lock.json` already resolved React Query **5.106.0** and its exact `@tanstack/query-core@5.106.0` dependency, with registry URLs and SHA-512 integrity hashes. Npm attempted a different release during the failing import.

## Fix

1. The frontend manifest pins `@tanstack/react-query` to **exactly 5.106.0**, a resolved version from the existing committed lockfile. No package downgrade or change of APIs is needed.
2. `scripts/clean_repository.py` now restores missing complete npm v3 locks directly from Git's **HEAD** tree (`git show HEAD:backend/package-lock.json` and the frontend equivalent). The importer deliberately preserves `.git`; it can thus recover the last committed lock before running `npm ci`. **No npm install**, fetching the registry, or semver upgrade happens during bootstrap.
3. `scripts/verify_dependency_locks.py` validates the root manifests and every direct locked package, requires matching TanStack Query/Core versions and integrity hashes, and only adjusts root lock metadata when a range changes to the *exact version that was already locked*. It rejects other dependency updates, incomplete locks and unmatched packages. The actual `resolved`, `integrity` and full dependency graph are left untouched.
4. `scripts/validate_repository.py` now also checks both complete prepared lockfiles during repository CI. Future changes to packages require a complete, intentionally regenerated npm lockfile in the source ZIP, not an implicit network resolution.
5. An offline regression suite simulates a Git checkout, replacement ZIP import, erased lockfiles, repeat recovery, unacceptable upgrades, missing direct dependencies and Query/Core mismatch.

## Deployment behavior and safety

The importer still accepts exactly one new root-level ZIP changed in the triggering commit, imports the four canonical roots and retains `.git`/`.github`. Do not delete a previous root ZIP in the same upload commit. Existing production data, Prisma migrations, authorization policies, 13-industry inventory and catalogue remain unchanged by this dependency repair.

**Important:** An environment without the previous committed locks must provide valid complete lockfiles in the archive; the cleaner fails closed rather than regenerating floating versions. If updating a dependency intentionally, regenerate **both** complete package-lock files from a trusted registry-connected environment, commit them with the package manifests inside the new ZIP and test `npm ci` before upload.

## Verification

- `python3 scripts/test_dependency_lock_reproducibility.py`
- `node --experimental-strip-types --test backend/test/*.test.mjs` (from `backend/`)
- `python3 scripts/sync_industry_catalogue.py --check`
- `python3 scripts/sync_electronics_catalogue_v2.py --check`
- `python3 backend/scripts/check-openapi-coverage.py`
- `python3 backend/scripts/check-route-adapter-coverage.py`
- `node backend/scripts/check-backup-inventory.mjs`
- Full GitHub Actions: restored lockfiles, `npm ci`, Prisma generate/validate, backend test/build, frontend test/build; CI must pass before release.

Do not claim a production deployment or full dependency-backed build until the new GitHub workflow completes. Database migration execution is outside the scope of this npm recovery; do not run destructive migration commands to resolve a dependency failure.
