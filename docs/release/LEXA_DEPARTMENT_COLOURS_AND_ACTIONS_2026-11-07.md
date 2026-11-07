# LEXA module-group colour system and Actions #159 repair

## Changes

This release fixes the frontend TypeScript `TS2379` failure in `AccountClosurePanel.tsx`. When the account owner has not entered a security code, the request now **omits** the optional `code` field rather than passing `undefined`. This satisfies `exactOptionalPropertyTypes` without changing the backend security contract. A provided authenticator/recovery code is still included.

All 11 business-module groups now share the same colour within the sidebar, active route, page controls, quick-action buttons, tables, charts, filters, and group-specific layouts. Each screen uses its `AppShell.tsx` path's `data-module-accent` and the latest shared `module-group-system.css`. Module-specific CSS variables inherit the relevant group tokens and no longer silently switch a page to another department's palette. This also fixes the Customer Growth, Production and Support screen group mismatches.

| Department | Accent identifier (backward-compatible) | Group colour | Primary accent |
|---|---|---|---|
| Workspace | navy | Royal blue | `#2563EB` |
| Reports & advice | gold | Purple | `#7C3AED` |
| Customers & growth | emerald | Fuchsia | `#C026D3` |
| Selling | coral | Tangerine | `#F97316` |
| Inventory | volt | Green | `#16A34A` |
| Logistics | violet | Teal | `#0D9488` |
| Purchasing | bronze | Golden yellow | `#EAB308` |
| Finance | sapphire | Azure blue | `#0284C7` |
| Team & payroll | mulberry | Pink | `#DB2777` |
| Production & quality | industrial | Coral red | `#EF4444` |
| Projects & service | indigo | Indigo | `#6366F1` |

Primary action buttons use darker, WCAG AA-contrasting shades, preserving white text. Status/alert colours are **not** rebranded because warning, success and error must retain their meaning. Existing icons remain LEXA custom icons; no `lucide-react` imports are added.

The chart library now uses the current group's accent for the primary line and first donut segment; multiple chart series retain visually distinct colours for comprehension. All customer, finance, sales, inventory, logistics and back-office workflows remain intact.

## Regression gates

- `python3 scripts/check_module_group_palette.py` confirms every actual sidebar navigation route's accent is the colour assigned to its group, including every Finance route, and checks all 11 group button colours against minimum white-text contrast of 4.5:1, plus light/dark tokens and relevant module root declarations. This script runs in frontend `prebuild` after the existing catalogue source check.
- `lexa-frontend/src/domain/shared/moduleAccents.test.ts` covers all 11 group route families and nested routes.
- The repo source ZIP still **excludes** `.github/`, npm lockfiles, and generated files by design. GitHub restores existing locks in `scripts/clean_repository.py`; no dependency changes were made in this release.

## Verification and deployment

The full backend tests and contract checks were run locally; the module palette and source-import layout preflights passed. A complete dependency-installed frontend build must still pass in GitHub Actions after upload; this environment cannot access the npm registry. No production data, billing entitlement, or database migration was changed in this release.
