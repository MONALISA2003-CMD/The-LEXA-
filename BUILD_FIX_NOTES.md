# Render build correction

Render's first build for commit `4fa06d01cc3ad6d31647793902bbc814a9f57a47` reached `npm run build` and failed with:

`backend/src/core/core.controller.ts:198:18 - TS2532: Object is possibly 'undefined'.`

The issue was the optional `maximumFractionDigits` value returned by `Intl.NumberFormat(...).resolvedOptions()`. The controller now uses a nullish fallback of `2` before exponentiation. The corrected expression was separately checked with TypeScript 5.8.3 in strict mode.

This file is included in the full consolidated overlay at `backend/src/core/core.controller.ts`. No database contents or migration history were changed by this build fix.
