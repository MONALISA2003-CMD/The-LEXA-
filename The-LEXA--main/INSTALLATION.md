# LEXA Increment 3 — installation

This ZIP is a repository-root overlay for `MONALISA2003-CMD/The-LEXA-` on branch `main`.

## Install from GitHub

1. Upload this ZIP to the repository root on `main`.
2. Allow the existing **LEXA ZIP Extractor** GitHub Action to validate and extract it. The action removes the uploaded ZIP and creates a follow-up commit titled `Extract repository ZIP archives`.
3. Verify that follow-up extraction commit contains the files listed in this package. Do not treat the initial ZIP-upload commit as the code commit.
4. Let Vercel and Render deploy the extracted commit automatically. Both deployments must use the same full Git SHA.
5. Keep the Render service Docker Command override blank. The repository Dockerfile is responsible for running Prisma migrations before NestJS starts.
6. Confirm the `20261030200000_accounts_receivable` migration completed successfully and that `/health/live` and `/health/ready` return HTTP 200 before opening the Accounts Receivable screen.

Do not run the migration manually against production. Do not insert sample invoices, receipts, or payments into the live business workspace for testing.

## Validation commands

Run from `lexa-frontend/`:

```bash
npm test
npm run typecheck
npm run build
```

Run from `backend/`:

```bash
npm run db:validate
npm run build
```

The preparation environment used to assemble this ZIP did not have the project dependencies installed and could not reach the package registry. TypeScript syntax and structural checks were performed, but the full Vitest suite, strict project typecheck and production builds must still run in CI/Vercel/Render after installation.

## Post-deploy verification

- GitHub `main`, Vercel production and Render must all point at the same extracted commit SHA.
- Render logs must show no pending migrations and a successful NestJS startup.
- Neon must show a successful, non-rolled-back row for `20261030200000_accounts_receivable`.
- Confirm these tables exist: `ar_customer_invoices`, `ar_customer_invoice_lines`, `ar_customer_receipts`, and `ar_customer_receipt_allocations`.
- Use a dedicated non-production workspace and authenticated test user for end-to-end workflow checks. Do not use the live workspace for synthetic financial transactions.

## Safety / environment notes

- Existing `sales`, `sale_lines`, `sale_payments`, and `stock_movements` remain the authoritative sales, payments, and inventory ledgers.
- Creating or issuing an invoice does not move stock. Recording a receipt mirrors the value into the existing `sale_payments` ledger; it does not initiate a bank, card, or mobile-money transfer.
- Receipts are allocated in full to one or more invoices for the same customer. Unallocated advances are not supported yet.
- Refunds/returns against an issued invoice are blocked pending a customer credit-note workflow.
- This increment creates internal customer-billing invoices, not statutory tax invoices. It does not calculate tax, integrate EFRIS, or determine legal tax treatment. Do not use it as a substitute for the required statutory tax invoicing process.
