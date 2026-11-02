# Repository maintenance

The repository root is the only source root. Keep one `backend/` and one `lexa-frontend/`; never place an exported repository ZIP inside either application directory.

## Canonical source replacement

The permanent importer is `.github/workflows/repository-import.yml`. It accepts only `LEXA_CANONICAL_SOURCE.zip` uploaded at the repository root. Before replacing files it validates ZIP integrity, archive paths, symlinks, required source paths and the two expected application manifests. It then replaces the repository working tree, preserves the installed workflow directory, removes the uploaded archive, runs the cleanup and layout validators, runs the backend and frontend checks, and commits the clean result.

GitHub's built-in workflow token cannot modify files inside `.github/workflows/`. Before using the importer on the existing repository, install the ZIP's `.github/workflows/repository-import.yml` and `.github/workflows/backend-ci.yml` through the GitHub web editor or a token with workflow-file permission. Replace the existing ZIP extractor workflow rather than leaving two archive workflows enabled. After installation, upload only `LEXA_CANONICAL_SOURCE.zip` at the repository root and let the importer run.

## Source and database rules

- Keep application source only in `backend/` and `lexa-frontend/`.
- Preserve the active Prisma migration directories exactly. Their names are database migration identifiers already recorded in Neon.
- Do not commit ZIPs, build output, dependency folders, caches, live environment files, credentials or production data.
- Run `python3 scripts/clean_repository.py` followed by `python3 scripts/validate_repository.py` before creating a new source archive.
- Do not modify Neon production rows as part of repository cleanup. Legacy alert runbook paths are mapped by the backend compatibility layer.
