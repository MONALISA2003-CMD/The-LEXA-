# LEXA Web Application

The frontend is a React, TypeScript and Vite application. It communicates with the NestJS API through a shared credentialed REST client and uses the versioned contract in `openapi/backend-contract.yaml`.

## Local development

```bash
npm install
npm run dev
```

## Validation

```bash
npm run test
npm run typecheck
npm run build
npm run test:e2e
```

`npm run build` runs the unit suite, TypeScript project build and Vite production bundle. The source tree is checked in as the build input; deployment does not apply source patches or mutate modules during the build.

## Configuration

- Production defaults to API-backed persistence.
- Device-local mode is available only as an explicit development setting and does not synchronize across users or devices.
- `VITE_API_BASE_URL` may contain the public API origin. Never add credentials, database URLs, signing keys or provider tokens to `VITE_*` settings.

## Source layout

- `src/app/` — application shell, routing and providers.
- `src/modules/` — business workspaces and screens.
- `src/domain/` — types, deterministic business rules and calculations.
- `src/data/contracts/` — typed persistence and workflow contracts.
- `src/data/local/` — explicit device-local adapters.
- `src/data/remote/` — API client and backend adapters.
- `openapi/backend-contract.yaml` — API contract.

Generic register actions do not silently post to ledgers, send payments, contact tax authorities or trigger third-party services. Those actions require an authoritative backend workflow.
