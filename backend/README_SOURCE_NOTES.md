# Notes for this LEXA API patch

This overlay advances the API beyond the original health-only scaffold. It should be reviewed and tested on the active Neon database before real business use. Render's `DATABASE_URL` must remain a secret; do not include credentials in the frontend or commit them to Git.

The patch uses the existing migration history and adds `20261029195000_api_foundation`. Production deployment must run `prisma migrate deploy` via the Dockerfile default command. Do not reset the database or run `prisma migrate dev` against production.

Still not implemented here: file attachment storage/upload/download, production email delivery for password resets, payment processors, external tax authority integrations, statutory reporting certification, and all advanced modules in the frontend contract. Generic module report responses are operational snapshots only.

First-admin creation also requires `LEXA_BOOTSTRAP_SECRET` in Render. Choose a strong one-time code, enter it through the `/create-account` UI, and do not expose it as a `VITE_*` variable. For reliable cookie sessions, deploy `lexa-frontend/vercel.json` and set Vercel `VITE_API_BASE_URL=https://lexareview.vercel.app` so the browser talks to the API through the same origin.
