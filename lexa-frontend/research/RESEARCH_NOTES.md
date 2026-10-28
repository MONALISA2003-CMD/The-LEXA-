# LEXA Frontend: implementation research

Research checked on 2026-10-28.

## Stack and compatibility

- Vite's official guide recommends `create-vite` for a React TypeScript app and documents a current Node baseline of 20.19+ or 22.12+. Project recommendation: Node 24 LTS for ongoing maintenance, with CI/deployment pinned to the version actually tested.
- React Router documents three modes. Data Mode exposes route loaders/actions and pending-state patterns while preserving control over the app architecture; this starter uses `createBrowserRouter` / `RouterProvider`.
- Tailwind's current Vite setup uses `tailwindcss` plus `@tailwindcss/vite` and `@import "tailwindcss"`.
- Dexie wraps IndexedDB with Promise-based operations, indexed queries, migrations, and transaction handling. Local IndexedDB is browser-profile local, not a multi-user database.
- TanStack Query is compatible with React 18+ and is used as the async/cache lifecycle layer only; it is not a second database of business records.

## Domain choices taken from the LEXA brief

- Currency amounts are stored as integers in currency minor units; do not use floating-point totals.
- A sale writes its header, lines, payment records and stock movements atomically in the local database transaction.
- Stock is derived from the movement ledger rather than edited as an independent total.
- Completed sales remain visible; returns create referencing records and positive stock movements rather than deleting the sale.
- A local payment record does not mean LEXA transferred money.
- The interface does not claim remote sync, secure multi-user access, server-enforced roles, live identity services, tax submission, or AI integration.

## Official sources

- Vite Getting Started: https://vite.dev/guide/
- React Router modes: https://reactrouter.com/start/modes
- Tailwind CSS with Vite: https://tailwindcss.com/docs/installation/using-vite
- Dexie docs: https://dexie.org/docs/Dexie.js
- TanStack Query install docs: https://tanstack.com/query/latest/docs/framework/react/installation
- Node.js Release schedule: https://github.com/nodejs/Release

Note: package versions in `package.json` are version ranges based on the current stack research, not a verified lockfile. Resolve and commit the pnpm lockfile before deployment.
