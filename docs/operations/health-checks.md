# Runtime health checks

The API exposes:

- `GET /health/live` — process liveness; this must not depend on database availability.
- `GET /health/ready` — application readiness; this checks the database and returns a non-ready status when the database cannot be reached.

Vercel proxies `/api/v1/health/live` and `/api/v1/health/ready` to the corresponding unprefixed Render routes. Normal API requests are proxied under `/api/v1/`.

After a deployment, confirm both health endpoints, sign-in/session retrieval, workspace and branch access, one read-only business API call and structured Render logs. A successful Docker build is not sufficient evidence of application readiness.
