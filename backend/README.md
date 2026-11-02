# LEXA API

The API is a NestJS application using the Fastify adapter and Prisma 7 against Neon PostgreSQL. It owns identity, session validation, workspace and branch access, business operations, audit records, API validation and server-side AI routing.

## Local setup

```bash
cp .env.example .env
# Configure a development-only DATABASE_URL.
npm install
npm run db:generate
npm run db:validate
npm test
npm run build
npm run start:dev
```

Do not point local migration commands at production. `npm run db:migrate:deploy` applies checked-in migrations and must only be used against an explicitly selected target after review.

## Structure

- `src/` — API controllers, domain modules, authorization, services and persistence.
- `prisma/schema.prisma` — canonical database model.
- `prisma/migrations/` — immutable, ordered database migrations.
- `test/` — contract, security and domain tests.
- `scripts/` — database inventory, schema, API-contract and ledger checks.

## Security rules

Every tenant-owned read and write must derive the active user, workspace membership, branch grant and permission on the server. Browser-supplied identifiers are context, not proof of authorization. Consequential writes must be transactional and idempotent. Provider credentials must remain server-side; AI receives permission-filtered aggregate facts and has no database or write tools.
