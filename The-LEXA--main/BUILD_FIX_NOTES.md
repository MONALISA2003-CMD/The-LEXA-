# LEXA Increment 3 — deployment build repair

This is a small repository-root overlay for the two compile errors reported by the first Increment 3 deployment attempt.

## Changes

- `backend/src/receivables/receivables.controller.ts`: imports the NestJS `Body` parameter decorator, which is used by the create-invoice and record-receipt handlers.
- `lexa-frontend/src/modules/operations/AccountsReceivablePanel.tsx`: handles `Intl.NumberFormat.resolvedOptions().maximumFractionDigits` as an optional value under strict TypeScript settings, defaulting to zero fraction digits.

No migration, production data, permissions, ledger logic, or workflow behaviour is changed by this patch.

## Install

Upload this ZIP to the root of `MONALISA2003-CMD/The-LEXA-` on branch `main`, then allow the existing LEXA ZIP Extractor workflow to commit the extracted files. Confirm that the resulting extraction commit is the commit used by both Vercel and Render. Do not manually run migrations; the backend Dockerfile applies migrations before starting NestJS.
