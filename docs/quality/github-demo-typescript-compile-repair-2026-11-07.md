# LEXA demo GitHub Actions TypeScript compilation repair — 7 November 2026

## Observed CI failure

GitHub Actions run `42330453318`, job `128275537752` completed ZIP import and source validation, passed 447 Node backend tests, passed the backend analytics tests and contract checks, and passed route uniqueness and backup inventory. The NestJS build then stopped with exactly two TypeScript errors:

1. `backend/src/demo/demo-policy.ts:28` (`TS2345`): `env[key]` is `string | undefined` under `strictNullChecks` and cannot be passed to `new URL()` without narrowing.
2. `backend/src/demo/demo-session.service.ts:1` (`TS2724`): `TooManyRequestsException` is not an export of the installed `@nestjs/common` package.

As the backend build failed, frontend compilation and the final source refresh commit did not run. An unsuccessful ZIP import workflow **does not publish this source tree to main**.

## Repairs

- Validate each environment URL as a non-empty `string` before invoking `new URL(configuredUrl)`, including explicit `postgres:`/`postgresql:` protocol validation and continued exact database-name (`lexa_demo`) enforcement.
- Replace the non-existent NestJS exception with `HttpException({code:'DEMO_RATE_LIMIT',...}, HttpStatus.TOO_MANY_REQUESTS)`; clients still receive the proper HTTP 429 response and structured error code.
- Add two demo-specific regression tests to prevent reintroducing either compiler-invalid pattern.
- Preserve all prior source ZIP import protections, backup inventory coverage, real customer subscription rules, and demo/production separation.

## Local verification

- Backend Node test suite: **449 passed, zero failed**.
- Backend analytics Python tests: **18 passed**.
- Source ZIP importer test suite: **18 passed**.
- Route uniqueness: **562 registrations** across 36 controllers, passed.
- Backup inventory: **227 decisions** covering 211 discovered references, passed.
- Backend contract checks: **496 OpenAPI operations**, 19 backend adapters, 13-industry and electronics catalogues synchronized, passed.
- TypeScript source syntax audit and ZIP structure preflight run before packaging.

## Production release gates still required

The local environment cannot access the npm registry. A complete `npm ci`, Prisma generator, NestJS build, frontend `npm run build`, and interactive browser/database smoke test must be run by GitHub Actions and staging before deploying the demo service or public marketing site. The fixed source ZIP deliberately contains no live `.env` values, `node_modules`, committed production data, or `.github` workflow files.

Upload **one** canonical root-level ZIP; verify the workflow completes *both* backend and frontend builds and makes its validated source commit before starting Render or Vercel demo deployments.
