# LEXA Frontend

LEXA is a React + TypeScript business workspace. This repository contains the frontend and a versioned REST API contract; it does **not** contain or deploy the backend service. Production builds default to API mode and show an explicit connection failure instead of pretending that browser-local data is server-saved. Local-only development is an explicit setting.

## Provider modes

- Production/default: `VITE_DATA_PROVIDER=api`, `VITE_API_BASE_URL=https://your-api-origin`. API requests target `/api/v1`. The endpoint contract is [`openapi/backend-contract.yaml`](openapi/backend-contract.yaml).
- Device-only development: create `.env.local` with `VITE_DATA_PROVIDER=local`. This uses IndexedDB and localStorage, does not synchronize across devices, and must not be represented as multi-user production functionality.
- Do not put secrets into `VITE_*` values. Vite embeds those values in browser assets. Configure only a public API origin; database credentials and privileged secrets belong on the server.

## Current boundaries (read before launch)

The frontend has interchangeable repository/provider contracts for workspaces, branches, products, inventory, sales, dashboard reports and the expanded module registers. The API adapter is prepared, with request IDs, timeouts, structured errors, credentialed requests and idempotency keys on consequential writes. The OpenAPI contract specifies the API expected by those adapters.

A connected backend is still required for actual server persistence, identity/session issuance, team invitations, role enforcement, cross-device sync, server-side business validation, financial/stock ledger posting, data backup and integrations (mobile money, bank feeds, email, URA/EFRIS, carrier, payroll statutory reporting). Until the server implements the contract and is tested against it, do **not** advertise the product as fully end-to-end connected. The frontend rejects API errors rather than silently falling back to local demo data.

Expanded register screens save records through the same module service boundary. A status change in a generic register is not a ledger posting or external action unless the backend implements the corresponding workflow and returns its authoritative result. Report pages in API mode require server-generated report snapshots; local calculations are confined to explicit local development mode.

## Start and validate

```bash
npm install
# optional: create .env.local for device-local development
npm run typecheck
npm test
npm run build
npm run test:e2e
```

## Layout

- `src/modules/`: page and workflow UI.
- `src/domain/`: types, business rules and calculations.
- `src/data/contracts/`: repository/workflow contracts.
- `src/data/local/`: explicitly local-only adapters.
- `src/data/remote/`: REST client and server adapters.
- `src/data/repositories/`: single provider-selected repository boundary.
- `openapi/backend-contract.yaml`: expected server interface.
- `research/FRONTEND_BACKEND_READINESS.md`: benchmark, findings and acceptance checklist.

## Security and operational expectations

The server must check object-level and function-level authorization for every workspace, branch, record, property and privileged mutation; frontend visibility is not a security control. Sales, stock, payment, and return operations must be server-transactional and idempotent, and the server must recompute all totals. Use secure cookie sessions or another approved server-side auth design; do not persist bearer tokens in localStorage.
