# LEXA frontend completion patch — upload-ready

## What this patch applies

This patch keeps the existing `lexa-frontend/` React + TypeScript + Vite structure. It does not add a new GitHub Actions workflow. It is designed for the repository's existing root-ZIP extraction workflow.

It adds or extends:

- a status-aware cross-module workflow graph for the existing operational preview modules, generic field mapping, source references, duplicate protection for one-to-one conversions, and local preview activity notes;
- a Business Tools screen for local cash-up, provisional Uganda tax/EFRIS guidance, manual document references, full core IndexedDB JSON backup/restore, CSV product/opening-stock imports, CSV exports, core product/receipt search, camera barcode scanning where supported, and device-local photo attachments;
- Simple/Advanced navigation with prominent core actions for mobile use;
- core POS split-payment lines, automatic unpaid-balance calculation, customer name/phone validation for credit sales, promised payment dates, later customer instalment recording, derived Paid/Part-paid/Unpaid/Overdue states, and improved receivables math;
- tests for module interconnections, CSV/data recovery helpers, and the core credit/installment workflow;
- a guarded, idempotent `prebuild` transformation plus unit-test execution before the regular TypeScript/Vite build.

## Apply the patch

1. Replace the repository's existing root file `LEXA_MODULE_COMPLETION_PHASE5.zip` with this archive, preserving the **exact same filename**.
2. The existing `.github/workflows/extract-frontend.yml` should extract the files and commit them. This archive deliberately contains no `.github/workflows/*` files, avoiding the missing GitHub Actions `workflows` permission that caused the previous push to fail.
3. Watch the extractor at https://github.com/MONALISA2003-CMD/The-LEXA-/actions. If it fails, inspect the step output before proceeding.
4. Vercel should pick up the resulting commit through its normal Git integration. The expected command is `npm run build`; the `prebuild` hook runs `python3 scripts/complete_modules.py && npm test` before the existing `tsc -b && vite build`.
5. Accept the change only when the GitHub extractor succeeds, all frontend unit tests pass, Vercel completes a successful build, and the deployed preview is exercised on a phone and desktop.

## Important capability boundaries

The current application is local-first and stores core workspace, product, stock, sale, payment, return and audit records in the browser's IndexedDB. The new Business Tools cash-up, tax profile/manual-reference notes and photo attachments also remain on the device. The module catalogue's related actions create separate preview drafts; they do not post into core stock, supplier payables, cash accounts or a live general ledger.

LEXA still does **not** have cloud sync, server-backed multi-user access, enforced roles, a central shared database, payment processing, bank/wallet feeds, direct URA/EFRIS submission, trusted server-side audit logging, or verified statutory payroll. Tax values in the supplied concept were explicitly based on secondary sources and require confirmation with URA or a qualified tax adviser before being relied on. The tax panel labels these values as provisional and does not submit to URA.

## Publication status

This ZIP is a prepared source patch, not evidence of a live deployment. The connected GitHub integration rejected direct file/branch writes and the connected Vercel integration rejected preview/production deployment creation due to permissions. Replacing the root ZIP is the supported route using the repository's existing extractor; afterwards verify the real CI/build result rather than assuming it succeeded.
