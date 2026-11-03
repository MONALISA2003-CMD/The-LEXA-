# Apply the Vercel green-build patch

The small patch ZIP contains the corrected file at the repository-relative path:

`lexa-frontend/src/modules/reports/AuthoritativeReportsPage.tsx`

Copy that file over the same path in the root of `MONALISA2003-CMD/The-LEXA-`, preserving the directory structure. Commit the change to `main` so the linked `lexa_review` project is triggered.

This source patch contains no provider keys. Do not paste provider credentials into GitHub or Vercel frontend environment variables. They remain server-side Render environment variables.

After Vercel starts the new build, verify:

- `prebuild` passes.
- Vitest passes.
- `tsc -b && vite build` passes.
- The production deployment reaches `READY`.

The current latest Vercel build passed 23 test files / 99 tests and failed only on three TypeScript diagnostics in this page; all three are corrected in the supplied version.
