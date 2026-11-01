# LEXA frontend build repair — read-only module metadata

This overlay fixes the current Vercel prebuild failure without relaxing transactional controls.

## Changes

- Sales orders, Purchase orders, Goods receiving and Deliveries & fulfilment remain `readOnly` and now expose `fields: []` to the generic editor.
- Their former field definitions are retained as `detailFields`, used only for human-readable record-detail labels.
- The module detail panel resolves labels from `detailFields` before falling back to editable `fields` and register columns.
- `moduleCatalog.test.ts` now verifies that all four transactional screens have zero editable fields and retain unique detail metadata.
- The Audit module remains read-only as before.

No backend controller, stock posting, reservation, delivery, CSRF, session, permission, migration or database code is changed.

## Install

Upload this ZIP to the repository root on `main` and allow the existing ZIP extractor to create its follow-up extraction commit. Do not delete or replace unrelated files. Render's Docker Command override must remain blank.
