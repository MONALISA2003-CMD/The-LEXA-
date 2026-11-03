# Repository consolidation guide

## Canonical source layout

The repository root contains one `backend/` and one `lexa-frontend/`. Both are deployed from the repository root by their respective hosting services. The frontend is not inside a folder named after the repository.

```text
.
├── .github/workflows/
├── backend/
├── deploy/
├── docs/
├── lexa-frontend/
├── scripts/
├── services/
├── .dockerignore
├── .gitignore
├── README.md
└── render.yaml
```

## Source of truth

The consolidated tree uses the latest polished frontend and single-service backend source. Duplicate full-repository snapshots and obsolete patch bundles are not part of the active source layout. Unique SQL files from old patch bundles are preserved under `docs/archive/deferred-migrations/`; they are not active Prisma migrations and must not be copied into `backend/prisma/migrations/` without database review.

## Deployment roots

- Vercel project root: `lexa-frontend`
- Vercel framework: Vite
- Vercel build command: `npm run build`
- Vercel output: `dist`
- Render Dockerfile: `backend/Dockerfile`
- Render Docker context: repository root (`.`)

The same clean layout should be used in GitHub, Vercel and Render. After consolidation, set the Vercel root directory back to `lexa-frontend`; do not set it to `The-LEXA/lexa-frontend`.

## One-time GitHub procedure

The current ZIP import workflow skips `.github/workflows/*` because GitHub's default workflow token cannot modify workflow files. Replace `.github/workflows/extract-frontend.yml` manually with the version in this package first. Then upload the root-level ZIP to the repository root. The updated workflow normalizes a single enclosing folder, extracts the source at the repository root, runs `scripts/cleanup_legacy_repo_copies.py`, and commits the consolidated tree.

After import, run:

```bash
python3 scripts/check_repository_layout.py
```

Do not upload a ZIP that contains a top-level `The-LEXA/` folder.
