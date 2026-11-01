# LEXA repository structure

## Canonical application layout

The repository root is the only source root. The application is maintained in these directories:

```text
.
├── .github/workflows/       # validation and one-time archive import
├── backend/                 # NestJS API, Prisma schema and migrations
├── lexa-frontend/           # Vite/React browser application
├── services/                # supporting intelligence components
├── docs/                    # architecture, deployment, history and validation
├── deploy/                  # recovery and deployment references
├── scripts/                 # repository checks and maintenance
├── .dockerignore
├── .gitignore
├── README.md
└── render.yaml
```

There must be exactly one `backend/package.json` and one `lexa-frontend/package.json`. Do not place a copy of the repository inside `The-LEXA/`, `The-LEXA--main/`, `LEXA_WS8_updated/`, or any other wrapper folder. Do not commit exported ZIP archives, build output, dependency directories, or environment secrets.

## Hosting configuration

- **Vercel root directory:** `lexa-frontend`
- **Vercel framework:** Vite
- **Vercel build command:** `npm run build`
- **Vercel output directory:** `dist`
- **Render service:** the existing `lexa-backend-api-live`
- **Render Dockerfile:** `backend/Dockerfile`
- **Render Docker context:** repository root (`.`)

Do not set Vercel to `The-LEXA/lexa-frontend`. The backend must continue using the existing Render service and current database; the repository cleanup does not reset or modify production data or migration history.

## Importing this consolidated source

The full source archive is created with the repository files at the ZIP root, without a parent folder. The current repository's older workflows must first be replaced with both updated files: `.github/workflows/extract-frontend.yml` (safe root import and cleanup) and `.github/workflows/backend-ci.yml` (validation of backend, frontend and supporting services). The old archive-import workflow extracts an enclosing folder literally and does not run cleanup; the old CI workflow only validates the backend. GitHub does not allow the archive-import workflow to replace workflow YAML using its default token, so both workflow files must be updated once through GitHub's web editor.

After both updated workflows are saved to `main`, upload the full source ZIP to the repository root. The workflow will:

1. validate the archive paths and reject unsafe entries;
2. extract the root-level source (normalizing one enclosing repository folder if one is present);
3. archive unique historical notes and deferred SQL outside active migrations;
4. remove duplicate repository snapshots, patch bundles and the uploaded ZIP;
5. run `python3 scripts/check_repository_layout.py` before committing.

For a manually run cleanup after the import, the workflow also supports `workflow_dispatch` and runs the maintenance script even when no ZIP is present.

## Local verification

```bash
python3 scripts/check_repository_layout.py
cd lexa-frontend
npm install
npm test
npm run build
```

Provider credentials remain in Render's private environment settings. Never add secrets to GitHub source files, Vercel browser environment variables, or this archive.
